// routes/loan_payments.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sendEmail = require('../utils/mail');

// ===============================
// POST /api/loan-payments/pay
// Insert a loan payment by user email
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
            return res.status(404).json({ success: false, message: `No user found with email: ${email}` });
        }

        const user_id = users[0].user_id;
        const username = users[0].username;

        // Step 2: Find the active/latest loan for this user
        const [loans] = await db.query(`
            SELECT l.loan_id, l.total_repayment, l.loan_amount, l.duration_weeks, l.status
            FROM loans l
            JOIN user_profiles up ON l.profile_id = up.profile_id
            WHERE up.user_id = ? AND l.status IN ('approved', 'active')
            ORDER BY l.created_at DESC
            LIMIT 1
        `, [user_id]);

        if (loans.length === 0) {
            return res.status(404).json({ success: false, message: `No active loan found for user with email: ${email}` });
        }

        const loan_id = loans[0].loan_id;
        const totalRepayment = loans[0].total_repayment;

        // Step 3: Get total amount paid so far
        const [paymentSummary] = await db.query(`
            SELECT COALESCE(SUM(amount_paid), 0) as total_paid
            FROM loan_payments
            WHERE loan_id = ?
        `, [loan_id]);

        const currentTotalPaid = paymentSummary[0].total_paid;
        const newTotalPaid = currentTotalPaid + amount_paid;
        const remainingBalance = totalRepayment - newTotalPaid;

        // Step 4: Insert the payment
        const [result] = await db.query(
            `INSERT INTO loan_payments (loan_id, amount_paid, payment_date, payment_method, recorded_by)
             VALUES (?, ?, ?, ?, ?)`,
            [loan_id, amount_paid, payment_date, payment_method || null, user_id]
        );

        // Step 5: Check if loan is fully paid and update status if needed
        let loanCompleted = false;
        if (remainingBalance <= 0) {
            await db.query(`UPDATE loans SET status = 'completed' WHERE loan_id = ?`, [loan_id]);
            loanCompleted = true;
        }

        // Step 6: Send email notification
        let emailSent = false;
        let emailError = null;

        try {
            const formattedAmount = `MWK ${amount_paid.toLocaleString()}`;
            const formattedTotalPaid = `MWK ${newTotalPaid.toLocaleString()}`;
            const formattedRemaining = `MWK ${Math.max(0, remainingBalance).toLocaleString()}`;
            const paymentDateFormatted = new Date(payment_date).toLocaleDateString();

            let emailSubject = 'Payment Received - XTData Loan Platform';
            let emailMessage = `
Dear ${username},

We have received your loan payment.

Payment Details:
• Amount Paid: ${formattedAmount}
• Payment Date: ${paymentDateFormatted}
• Payment Method: ${payment_method || 'Bank Transfer'}
• Transaction ID: ${result.insertId}

Payment Summary:
• Total Paid So Far: ${formattedTotalPaid}
• Remaining Balance: ${formattedRemaining}
`;

            if (loanCompleted) {
                emailSubject = 'Loan Fully Paid - Congratulations! 🎉';
                emailMessage += `

🎉 CONGRATULATIONS! 🎉

Your loan has been FULLY PAID!

Thank you for being a responsible borrower. You are now eligible to apply for a new loan.

We appreciate your trust in XTData Loan Platform.
`;
            } else if (remainingBalance > 0) {
                const weeklyPayment = totalRepayment / loans[0].duration_weeks;
                const nextPaymentDue = new Date();
                nextPaymentDue.setDate(nextPaymentDue.getDate() + 7);
                
                emailMessage += `

Next Steps:
• Next Payment Due: ${nextPaymentDue.toLocaleDateString()}
• Suggested Payment: MWK ${weeklyPayment.toLocaleString()}
• Total Remaining: ${formattedRemaining}

Please continue making timely payments to maintain good credit standing.
`;
            }

            emailMessage += `

Thank you for choosing XTData Loan Platform.

Regards,
XTData Team
`;

            await sendEmail(email, emailSubject, emailMessage);
            emailSent = true;
            console.log(`Payment confirmation email sent to: ${email}`);

        } catch (err) {
            console.error('Failed to send payment confirmation email:', err);
            emailError = err.message;
        }

        return res.status(201).json({
            success: true,
            message: 'Payment recorded successfully.',
            email_notification_sent: emailSent,
            loan_completed: loanCompleted,
            data: {
                payment_id: result.insertId,
                loan_id,
                user_id,
                email,
                amount_paid,
                payment_date,
                payment_method: payment_method || null,
                total_paid_so_far: newTotalPaid,
                remaining_balance: Math.max(0, remainingBalance),
                loan_status: loanCompleted ? 'completed' : 'active'
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
// Get total amount paid by user email (NO EMAIL SENT)
// Query param: ?email=user@example.com
// ===============================
router.get('/total-paid-by-email', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email query parameter is required.'
        });
    }

    try {
        // Check if user exists
        const [userCheck] = await db.query(
            `SELECT user_id, username, email FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        if (userCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No user found with email: ${email}`
            });
        }

        const user = userCheck[0];

        // Get total paid amount for the user
        const [paymentData] = await db.query(`
            SELECT 
                COALESCE(SUM(lp.amount_paid), 0) AS total_amount_paid,
                COUNT(lp.payment_id) AS total_payments,
                MAX(lp.payment_date) AS last_payment_date,
                MIN(lp.payment_date) AS first_payment_date,
                GROUP_CONCAT(DISTINCT lp.payment_method) AS payment_methods_used
            FROM users u
            LEFT JOIN user_profiles up ON u.user_id = up.user_id
            LEFT JOIN loans l ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ?
        `, [email]);

        // Get current loan information if exists
        const [loanInfo] = await db.query(`
            SELECT 
                l.loan_id,
                l.loan_amount,
                l.total_repayment,
                l.interest_rate,
                l.duration_weeks,
                l.status,
                COALESCE(SUM(lp.amount_paid), 0) AS paid_amount,
                (l.total_repayment - COALESCE(SUM(lp.amount_paid), 0)) AS remaining_balance
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            JOIN loans l ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ? AND l.status IN ('active', 'approved', 'pending')
            GROUP BY l.loan_id, l.loan_amount, l.total_repayment, l.interest_rate, l.duration_weeks, l.status
            ORDER BY l.created_at DESC
            LIMIT 1
        `, [email]);

        const paymentSummary = paymentData[0];
        const totalPaid = parseFloat(paymentSummary.total_amount_paid || 0);
        
        // Calculate payment progress if there's an active loan
        let paymentProgress = null;
        if (loanInfo.length > 0 && loanInfo[0].total_repayment > 0) {
            paymentProgress = ((totalPaid / parseFloat(loanInfo[0].total_repayment)) * 100).toFixed(2);
        }

        return res.status(200).json({
            success: true,
            message: 'Total paid amount retrieved successfully.',
            data: {
                user: {
                    user_id: user.user_id,
                    username: user.username,
                    email: user.email
                },
                payment_summary: {
                    total_amount_paid: totalPaid,
                    total_amount_paid_formatted: `MWK ${totalPaid.toLocaleString()}`,
                    total_payments: parseInt(paymentSummary.total_payments || 0),
                    first_payment_date: paymentSummary.first_payment_date,
                    last_payment_date: paymentSummary.last_payment_date,
                    payment_methods_used: paymentSummary.payment_methods_used ? 
                        paymentSummary.payment_methods_used.split(',') : []
                },
                current_loan: loanInfo.length > 0 ? {
                    loan_id: loanInfo[0].loan_id,
                    loan_amount: parseFloat(loanInfo[0].loan_amount),
                    loan_amount_formatted: `MWK ${parseFloat(loanInfo[0].loan_amount).toLocaleString()}`,
                    total_repayment: parseFloat(loanInfo[0].total_repayment),
                    total_repayment_formatted: `MWK ${parseFloat(loanInfo[0].total_repayment).toLocaleString()}`,
                    interest_rate: parseFloat(loanInfo[0].interest_rate),
                    duration_weeks: loanInfo[0].duration_weeks,
                    status: loanInfo[0].status,
                    paid_amount: parseFloat(loanInfo[0].paid_amount),
                    paid_amount_formatted: `MWK ${parseFloat(loanInfo[0].paid_amount).toLocaleString()}`,
                    remaining_balance: parseFloat(loanInfo[0].remaining_balance),
                    remaining_balance_formatted: `MWK ${Math.max(0, parseFloat(loanInfo[0].remaining_balance)).toLocaleString()}`,
                    payment_progress: `${paymentProgress}%`,
                    is_fully_paid: parseFloat(loanInfo[0].remaining_balance) <= 0
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

// ===============================
// GET /api/loan-payments/total-paid-simple
// Simple version - returns only total amount paid (NO EMAIL SENT)
// Query param: ?email=user@example.com
// ===============================
router.get('/total-paid-simple', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email query parameter is required.'
        });
    }

    try {
        // Check if user exists
        const [userCheck] = await db.query(
            `SELECT email FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        if (userCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No user found with email: ${email}`
            });
        }

        // Get total paid amount
        const [result] = await db.query(`
            SELECT 
                COALESCE(SUM(lp.amount_paid), 0) AS total_amount_paid
            FROM users u
            LEFT JOIN user_profiles up ON u.user_id = up.user_id
            LEFT JOIN loans l ON up.profile_id = l.profile_id
            LEFT JOIN loan_payments lp ON l.loan_id = lp.loan_id
            WHERE u.email = ?
        `, [email]);

        const totalAmount = parseFloat(result[0].total_amount_paid || 0);

        return res.status(200).json({
            success: true,
            email: email,
            total_amount_paid: totalAmount,
            total_amount_paid_formatted: `MWK ${totalAmount.toLocaleString()}`
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

// ===============================
// GET /api/loan-payments/paid-users
// Get all users who have made at least one payment
// ===============================
router.get('/paid-users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                u.user_id,
                u.username,
                u.email,
                l.loan_id,
                l.loan_amount,
                l.total_repayment,
                l.status as loan_status,
                COUNT(lp.payment_id) AS total_payments,
                SUM(lp.amount_paid) AS total_amount_paid,
                (l.total_repayment - COALESCE(SUM(lp.amount_paid), 0)) AS remaining_balance,
                MAX(lp.payment_date) AS last_payment_date,
                MIN(lp.payment_date) AS first_payment_date,
                MAX(lp.payment_method) AS payment_method
            FROM loan_payments lp
            INNER JOIN loans l ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u ON up.user_id = u.user_id
            GROUP BY u.user_id, u.username, u.email, l.loan_id, l.loan_amount, l.total_repayment, l.status
            ORDER BY last_payment_date DESC
        `);

        // Calculate payment progress percentage for each user
        const usersWithProgress = rows.map(user => ({
            ...user,
            loan_amount: parseFloat(user.loan_amount),
            total_amount_paid: parseFloat(user.total_amount_paid || 0),
            remaining_balance: parseFloat(user.remaining_balance || user.total_repayment),
            payment_progress: user.total_repayment > 0 
                ? ((parseFloat(user.total_amount_paid || 0) / parseFloat(user.total_repayment)) * 100).toFixed(2) + '%'
                : '0%'
        }));

        return res.status(200).json({
            success: true,
            message: 'Users with payments fetched successfully.',
            total: rows.length,
            data: usersWithProgress
        });

    } catch (error) {
        console.error('Error fetching paid users:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch paid users.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ===============================
// GET /api/loan-payments/history/:email
// Get full payment history for a specific user by email
// ===============================
router.get('/history/:email', async (req, res) => {
    const { email } = req.params;

    try {
        // Get payment history
        const [rows] = await db.query(`
            SELECT
                lp.payment_id,
                lp.loan_id,
                lp.amount_paid,
                lp.payment_date,
                lp.payment_method,
                lp.created_at as recorded_at,
                u.email,
                u.username,
                l.loan_amount,
                l.total_repayment,
                l.status as loan_status
            FROM loan_payments lp
            INNER JOIN loans l ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u ON up.user_id = u.user_id
            WHERE u.email = ?
            ORDER BY lp.payment_date DESC
        `, [email]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: `No payment history found for email: ${email}` 
            });
        }

        // Get summary statistics
        const [summary] = await db.query(`
            SELECT
                COUNT(lp.payment_id) as total_payments,
                SUM(lp.amount_paid) as total_amount_paid,
                MIN(lp.payment_date) as first_payment,
                MAX(lp.payment_date) as last_payment,
                l.total_repayment,
                l.loan_amount
            FROM loan_payments lp
            INNER JOIN loans l ON lp.loan_id = l.loan_id
            INNER JOIN user_profiles up ON l.profile_id = up.profile_id
            INNER JOIN users u ON up.user_id = u.user_id
            WHERE u.email = ?
            GROUP BY l.total_repayment, l.loan_amount
        `, [email]);

        const paymentSummary = summary[0] || {};
        
        return res.status(200).json({
            success: true,
            message: 'Payment history fetched successfully.',
            summary: {
                total_payments: paymentSummary.total_payments || 0,
                total_amount_paid: parseFloat(paymentSummary.total_amount_paid || 0),
                first_payment_date: paymentSummary.first_payment,
                last_payment_date: paymentSummary.last_payment,
                original_loan_amount: parseFloat(paymentSummary.loan_amount || 0),
                total_repayment: parseFloat(paymentSummary.total_repayment || 0),
                remaining_balance: parseFloat(paymentSummary.total_repayment || 0) - parseFloat(paymentSummary.total_amount_paid || 0)
            },
            total: rows.length,
            data: rows.map(payment => ({
                ...payment,
                amount_paid: parseFloat(payment.amount_paid),
                loan_amount: parseFloat(payment.loan_amount),
                total_repayment: parseFloat(payment.total_repayment)
            }))
        });

    } catch (error) {
        console.error('Error fetching payment history:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch payment history.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ===============================
// GET /api/loan-payments/payment-summary
// Get overall payment summary for all users
// ===============================
router.get('/payment-summary', async (req, res) => {
    try {
        const [summary] = await db.query(`
            SELECT
                COUNT(DISTINCT lp.loan_id) as loans_with_payments,
                COUNT(DISTINCT u.user_id) as users_who_paid,
                COUNT(lp.payment_id) as total_payments,
                SUM(lp.amount_paid) as total_revenue,
                AVG(lp.amount_paid) as average_payment,
                MAX(lp.amount_paid) as largest_payment,
                MIN(lp.amount_paid) as smallest_payment,
                DATE_FORMAT(MAX(lp.payment_date), '%Y-%m-%d') as latest_payment_date,
                DATE_FORMAT(MIN(lp.payment_date), '%Y-%m-%d') as first_payment_date
            FROM loan_payments lp
            LEFT JOIN loans l ON lp.loan_id = l.loan_id
            LEFT JOIN user_profiles up ON l.profile_id = up.profile_id
            LEFT JOIN users u ON up.user_id = u.user_id
        `);

        // Get monthly payment breakdown
        const [monthlyBreakdown] = await db.query(`
            SELECT
                DATE_FORMAT(payment_date, '%Y-%m') as month,
                COUNT(*) as payment_count,
                SUM(amount_paid) as total_amount,
                AVG(amount_paid) as average_amount
            FROM loan_payments
            GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
            ORDER BY month DESC
            LIMIT 12
        `);

        return res.status(200).json({
            success: true,
            message: 'Payment summary retrieved successfully.',
            data: {
                overall: {
                    total_revenue: parseFloat(summary[0].total_revenue || 0),
                    total_payments: summary[0].total_payments || 0,
                    loans_with_payments: summary[0].loans_with_payments || 0,
                    users_who_paid: summary[0].users_who_paid || 0,
                    average_payment: parseFloat(summary[0].average_payment || 0),
                    largest_payment: parseFloat(summary[0].largest_payment || 0),
                    smallest_payment: parseFloat(summary[0].smallest_payment || 0),
                    first_payment_date: summary[0].first_payment_date,
                    latest_payment_date: summary[0].latest_payment_date
                },
                monthly_breakdown: monthlyBreakdown.map(month => ({
                    ...month,
                    total_amount: parseFloat(month.total_amount),
                    average_amount: parseFloat(month.average_amount)
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching payment summary:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch payment summary.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

module.exports = router;