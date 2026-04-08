// routes/loan_payments.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const sendEmail = require('../utils/mail');

// ─── Helper: all statuses that are NOT completed ───────────────────────────
// Add any extra status values your DB uses here.
const ACTIVE_STATUSES = ['active', 'approved', 'pending', 'disbursed', 'open', 'running'];

// ===============================
// POST /api/loan-payments/pay
// ===============================
router.post('/pay', async (req, res) => {
    const { email, amount_paid, payment_date, payment_method } = req.body;

    if (!email || !amount_paid || !payment_date) {
        return res.status(400).json({
            success: false,
            message: 'email, amount_paid, and payment_date are required.'
        });
    }

    try {
        // Step 1: Find user by email
        const [users] = await db.query(
            `SELECT user_id, username FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No user found with email: ${email}`
            });
        }

        const { user_id, username } = users[0];

        // Step 2: Find any loan that is NOT completed
        // Uses NOT IN ('completed') so any new status still works automatically
        const [loans] = await db.query(`
            SELECT l.loan_id, l.total_repayment, l.loan_amount, l.duration_weeks, l.status
            FROM loans l
            JOIN user_profiles up ON l.profile_id = up.profile_id
            WHERE up.user_id = ?
              AND LOWER(l.status) != 'completed'
            ORDER BY l.created_at DESC
            LIMIT 1
        `, [user_id]);

        if (loans.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No active loan found for email: ${email}. All loans may be completed.`
            });
        }

        const { loan_id, total_repayment, duration_weeks, status: loanStatus } = loans[0];

        // Step 3: Get total already paid
        const [paymentSummary] = await db.query(`
            SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
            FROM loan_payments
            WHERE loan_id = ?
        `, [loan_id]);

        const currentTotalPaid = Number(paymentSummary[0].total_paid);
        const newTotalPaid     = currentTotalPaid + Number(amount_paid);
        const remainingBalance = total_repayment  - newTotalPaid;

        // Step 4: Insert payment
        const [result] = await db.query(
            `INSERT INTO loan_payments (loan_id, amount_paid, payment_date, payment_method, recorded_by)
             VALUES (?, ?, ?, ?, ?)`,
            [loan_id, amount_paid, payment_date, payment_method || null, user_id]
        );

        // Step 5: Auto-complete loan if fully paid
        let loanCompleted = false;
        if (remainingBalance <= 0) {
            await db.query(`UPDATE loans SET status = 'completed' WHERE loan_id = ?`, [loan_id]);
            loanCompleted = true;
        }

        // Step 6: Send email notification
        let emailSent  = false;
        let emailError = null;

        try {
            const fmtMWK = (n) => `MWK ${Number(n).toLocaleString()}`;
            const weeklyPayment  = total_repayment / duration_weeks;
            const nextPayment    = new Date();
            nextPayment.setDate(nextPayment.getDate() + 7);

            let subject = 'Payment Received – XTData Loan Platform';
            let body    = `
Dear ${username},

We have received your loan payment.

─── Payment Details ───────────────────────
• Amount Paid:      ${fmtMWK(amount_paid)}
• Payment Date:     ${new Date(payment_date).toLocaleDateString()}
• Payment Method:   ${payment_method || 'Bank Transfer'}
• Transaction ID:   ${result.insertId}

─── Summary ───────────────────────────────
• Total Paid So Far:  ${fmtMWK(newTotalPaid)}
• Remaining Balance:  ${fmtMWK(Math.max(0, remainingBalance))}
`;

            if (loanCompleted) {
                subject = 'Loan Fully Paid – Congratulations! 🎉';
                body   += `\n🎉 Your loan is now FULLY PAID! Thank you for your timely repayments.\nYou are eligible to apply for a new loan.\n`;
            } else {
                body += `
─── Next Steps ────────────────────────────
• Next Payment Due:   ${nextPayment.toLocaleDateString()}
• Suggested Amount:   ${fmtMWK(weeklyPayment)}
• Total Remaining:    ${fmtMWK(Math.max(0, remainingBalance))}
`;
            }

            body += `\nThank you for choosing XTData Loan Platform.\n\nRegards,\nXTData Team\n`;

            await sendEmail(email, subject, body);
            emailSent = true;
        } catch (err) {
            console.error('Email send failed:', err.message);
            emailError = err.message;
        }

        return res.status(201).json({
            success: true,
            message: 'Payment recorded successfully.',
            email_notification_sent: emailSent,
            loan_completed: loanCompleted,
            data: {
                payment_id:       result.insertId,
                loan_id,
                user_id,
                email,
                amount_paid:      Number(amount_paid),
                payment_date,
                payment_method:   payment_method || null,
                total_paid_so_far: newTotalPaid,
                remaining_balance: Math.max(0, remainingBalance),
                loan_status:      loanCompleted ? 'completed' : loanStatus
            }
        });

    } catch (error) {
        console.error('Error recording payment:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record payment.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ===============================
// GET /api/loan-payments/total-paid-by-email
// ===============================
router.get('/total-paid-by-email', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    try {
        const [userCheck] = await db.query(
            `SELECT user_id, username, email FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        if (userCheck.length === 0) {
            return res.status(404).json({ success: false, message: `No user found with email: ${email}` });
        }

        const user = userCheck[0];

        const [paymentData] = await db.query(`
            SELECT
                COALESCE(SUM(lp.amount_paid), 0)    AS total_amount_paid,
                COUNT(lp.payment_id)                 AS total_payments,
                MAX(lp.payment_date)                 AS last_payment_date,
                MIN(lp.payment_date)                 AS first_payment_date,
                GROUP_CONCAT(DISTINCT lp.payment_method) AS payment_methods_used
            FROM users u
            LEFT JOIN user_profiles up ON u.user_id = up.user_id
            LEFT JOIN loans l          ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ?
        `, [email]);

        // Current loan: anything that is NOT completed
        const [loanInfo] = await db.query(`
            SELECT
                l.loan_id, l.loan_amount, l.total_repayment,
                l.interest_rate, l.duration_weeks, l.status,
                COALESCE(SUM(lp.amount_paid), 0) AS paid_amount,
                (l.total_repayment - COALESCE(SUM(lp.amount_paid), 0)) AS remaining_balance
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            JOIN loans l          ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ?
              AND LOWER(l.status) != 'completed'
            GROUP BY l.loan_id, l.loan_amount, l.total_repayment, l.interest_rate, l.duration_weeks, l.status
            ORDER BY l.created_at DESC
            LIMIT 1
        `, [email]);

        const summary   = paymentData[0];
        const totalPaid = parseFloat(summary.total_amount_paid || 0);

        let paymentProgress = null;
        if (loanInfo.length > 0 && loanInfo[0].total_repayment > 0) {
            paymentProgress = ((totalPaid / parseFloat(loanInfo[0].total_repayment)) * 100).toFixed(2);
        }

        return res.status(200).json({
            success: true,
            message: 'Total paid amount retrieved successfully.',
            data: {
                user: {
                    user_id:  user.user_id,
                    username: user.username,
                    email:    user.email
                },
                payment_summary: {
                    total_amount_paid:           totalPaid,
                    total_amount_paid_formatted: `MWK ${totalPaid.toLocaleString()}`,
                    total_payments:              parseInt(summary.total_payments || 0),
                    first_payment_date:          summary.first_payment_date,
                    last_payment_date:           summary.last_payment_date,
                    payment_methods_used:        summary.payment_methods_used
                                                   ? summary.payment_methods_used.split(',')
                                                   : []
                },
                current_loan: loanInfo.length > 0 ? {
                    loan_id:                    loanInfo[0].loan_id,
                    loan_amount:                parseFloat(loanInfo[0].loan_amount),
                    total_repayment:            parseFloat(loanInfo[0].total_repayment),
                    interest_rate:              parseFloat(loanInfo[0].interest_rate),
                    duration_weeks:             loanInfo[0].duration_weeks,
                    status:                     loanInfo[0].status,
                    paid_amount:                parseFloat(loanInfo[0].paid_amount),
                    remaining_balance:          Math.max(0, parseFloat(loanInfo[0].remaining_balance)),
                    payment_progress:           `${paymentProgress}%`,
                    is_fully_paid:              parseFloat(loanInfo[0].remaining_balance) <= 0
                } : null
            }
        });

    } catch (error) {
        console.error('Error fetching total paid amount:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch total paid amount.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ─── remaining routes unchanged ───────────────────────────────────────────

router.get('/total-paid-simple', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'Email required.' });
    try {
        const [userCheck] = await db.query(`SELECT email FROM users WHERE email = ? LIMIT 1`, [email]);
        if (userCheck.length === 0) return res.status(404).json({ success: false, message: `No user: ${email}` });

        const [result] = await db.query(`
            SELECT COALESCE(SUM(lp.amount_paid), 0) AS total_amount_paid
            FROM users u
            LEFT JOIN user_profiles up ON u.user_id = up.user_id
            LEFT JOIN loans l          ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ?
        `, [email]);

        const total = parseFloat(result[0].total_amount_paid || 0);
        return res.status(200).json({ success: true, email, total_amount_paid: total, total_amount_paid_formatted: `MWK ${total.toLocaleString()}` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed.', error: error.message });
    }
});

router.get('/paid-users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                u.user_id, u.username, u.email,
                l.loan_id, l.loan_amount, l.total_repayment, l.status AS loan_status,
                COUNT(lp.payment_id)       AS total_payments,
                SUM(lp.amount_paid)        AS total_amount_paid,
                (l.total_repayment - COALESCE(SUM(lp.amount_paid), 0)) AS remaining_balance,
                MAX(lp.payment_date)       AS last_payment_date,
                MIN(lp.payment_date)       AS first_payment_date,
                MAX(lp.payment_method)     AS payment_method
            FROM loan_payments lp
            INNER JOIN loans l          ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u          ON up.user_id = u.user_id
            GROUP BY u.user_id, u.username, u.email, l.loan_id, l.loan_amount, l.total_repayment, l.status
            ORDER BY last_payment_date DESC
        `);

        const data = rows.map(r => ({
            ...r,
            loan_amount:       parseFloat(r.loan_amount),
            total_amount_paid: parseFloat(r.total_amount_paid || 0),
            remaining_balance: parseFloat(r.remaining_balance || r.total_repayment),
            payment_progress:  r.total_repayment > 0
                ? ((parseFloat(r.total_amount_paid || 0) / parseFloat(r.total_repayment)) * 100).toFixed(2) + '%'
                : '0%'
        }));

        return res.status(200).json({ success: true, total: rows.length, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed.', error: error.message });
    }
});

router.get('/history/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT lp.payment_id, lp.loan_id, lp.amount_paid, lp.payment_date,
                   lp.payment_method, lp.created_at AS recorded_at,
                   u.email, u.username, l.loan_amount, l.total_repayment, l.status AS loan_status
            FROM loan_payments lp
            INNER JOIN loans l          ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u          ON up.user_id = u.user_id
            WHERE u.email = ?
            ORDER BY lp.payment_date DESC
        `, [email]);

        if (rows.length === 0) return res.status(404).json({ success: false, message: `No payment history for: ${email}` });

        const [summary] = await db.query(`
            SELECT COUNT(lp.payment_id) AS total_payments, SUM(lp.amount_paid) AS total_amount_paid,
                   MIN(lp.payment_date) AS first_payment,  MAX(lp.payment_date) AS last_payment,
                   l.total_repayment, l.loan_amount
            FROM loan_payments lp
            INNER JOIN loans l          ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u          ON up.user_id = u.user_id
            WHERE u.email = ?
            GROUP BY l.total_repayment, l.loan_amount
        `, [email]);

        const s = summary[0] || {};
        return res.status(200).json({
            success: true,
            summary: {
                total_payments:      s.total_payments || 0,
                total_amount_paid:   parseFloat(s.total_amount_paid || 0),
                first_payment_date:  s.first_payment,
                last_payment_date:   s.last_payment,
                original_loan_amount: parseFloat(s.loan_amount || 0),
                total_repayment:     parseFloat(s.total_repayment || 0),
                remaining_balance:   parseFloat(s.total_repayment || 0) - parseFloat(s.total_amount_paid || 0)
            },
            total: rows.length,
            data: rows.map(p => ({ ...p, amount_paid: parseFloat(p.amount_paid), loan_amount: parseFloat(p.loan_amount), total_repayment: parseFloat(p.total_repayment) }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed.', error: error.message });
    }
});

router.get('/payment-summary', async (req, res) => {
    try {
        const [summary] = await db.query(`
            SELECT COUNT(DISTINCT lp.loan_id) AS loans_with_payments,
                   COUNT(DISTINCT u.user_id)  AS users_who_paid,
                   COUNT(lp.payment_id)       AS total_payments,
                   SUM(lp.amount_paid)        AS total_revenue,
                   AVG(lp.amount_paid)        AS average_payment,
                   MAX(lp.amount_paid)        AS largest_payment,
                   MIN(lp.amount_paid)        AS smallest_payment,
                   DATE_FORMAT(MAX(lp.payment_date), '%Y-%m-%d') AS latest_payment_date,
                   DATE_FORMAT(MIN(lp.payment_date), '%Y-%m-%d') AS first_payment_date
            FROM loan_payments lp
            LEFT JOIN loans l          ON lp.loan_id = l.loan_id
            LEFT JOIN user_profiles up ON l.profile_id = up.profile_id
            LEFT JOIN users u          ON up.user_id = u.user_id
        `);

        const [monthly] = await db.query(`
            SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
                   COUNT(*)          AS payment_count,
                   SUM(amount_paid)  AS total_amount,
                   AVG(amount_paid)  AS average_amount
            FROM loan_payments
            GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
            ORDER BY month DESC
            LIMIT 12
        `);

        return res.status(200).json({
            success: true,
            data: {
                overall: {
                    total_revenue:         parseFloat(summary[0].total_revenue || 0),
                    total_payments:        summary[0].total_payments || 0,
                    loans_with_payments:   summary[0].loans_with_payments || 0,
                    users_who_paid:        summary[0].users_who_paid || 0,
                    average_payment:       parseFloat(summary[0].average_payment || 0),
                    largest_payment:       parseFloat(summary[0].largest_payment || 0),
                    smallest_payment:      parseFloat(summary[0].smallest_payment || 0),
                    first_payment_date:    summary[0].first_payment_date,
                    latest_payment_date:   summary[0].latest_payment_date
                },
                monthly_breakdown: monthly.map(m => ({
                    ...m,
                    total_amount:   parseFloat(m.total_amount),
                    average_amount: parseFloat(m.average_amount)
                }))
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed.', error: error.message });
    }
});

module.exports = router;