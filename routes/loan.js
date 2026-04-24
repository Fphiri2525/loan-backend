const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sendEmail = require('../utils/mail');

// ===============================
// GET LOAN STATUS BY EMAIL
// GET /api/loans/status?email=user@example.com
// ===============================
router.get('/status', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: "Email query parameter is required" });

        const [rows] = await db.query(`
            SELECT
                CASE WHEN up.profile_id IS NOT NULL THEN 1 ELSE 0 END AS profile_completed,
                CASE WHEN l.loan_id    IS NOT NULL THEN 1 ELSE 0 END AS loan_submitted,
                up.profile_id
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.user_id
            LEFT JOIN loans l          ON l.profile_id = up.profile_id
            WHERE u.email = ?
            LIMIT 1
        `, [email]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "User not found", profile_completed: 0, loan_submitted: 0 });
        }

        const { profile_completed, loan_submitted, profile_id } = rows[0];
        return res.status(200).json({ profile_completed, loan_submitted, profile_id: profile_id ?? null });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// CHECK IF LOAN IS APPROVED
// GET /api/loans/is-approved?email=user@example.com
// ===============================
router.get('/is-approved', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: "Email query parameter is required" });

        const [rows] = await db.query(`
            SELECT
                l.loan_id,
                l.loan_amount,
                l.interest_rate,
                l.interest_amount,
                l.total_repayment,
                l.duration_weeks,
                l.status,
                l.created_at
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            JOIN loans l ON up.profile_id = l.profile_id
            WHERE u.email = ?
            ORDER BY l.loan_id DESC
            LIMIT 1
        `, [email]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                is_approved: false,
                message: "No loan application found for this user"
            });
        }

        const loan = rows[0];
        const isApproved = loan.status === 'approved';

        return res.status(200).json({
            success: true,
            is_approved: isApproved,
            status: loan.status,
            message: isApproved
                ? "Your loan application has been approved"
                : `Your loan application is currently '${loan.status}'`,
            loan: {
                loan_id:         loan.loan_id,
                loan_amount:     Number(loan.loan_amount),
                interest_rate:   Number(loan.interest_rate),
                interest_amount: Number(loan.interest_amount),
                total_repayment: Number(loan.total_repayment),
                weekly_payment:  Number(loan.total_repayment) / loan.duration_weeks,
                duration_weeks:  loan.duration_weeks,
                created_at:      loan.created_at
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// APPLY FOR LOAN WITH EMAIL NOTIFICATIONS
// POST /api/loans/apply
// ===============================
router.post('/apply', async (req, res) => {
    try {
        const { email, loan_amount, interest_rate, duration_weeks } = req.body;

        if (!email || !loan_amount || !interest_rate || !duration_weeks) {
            return res.status(400).json({ message: "email, loan_amount, interest_rate and duration_weeks are required" });
        }

        // Validate loan amount
        if (loan_amount < 1000 || loan_amount > 10000000) {
            return res.status(400).json({ message: "Loan amount must be between MWK 1,000 and MWK 10,000,000" });
        }

        // Validate duration
        if (duration_weeks < 1 || duration_weeks > 52) {
            return res.status(400).json({ message: "Duration must be between 1 and 52 weeks" });
        }

        const [profileCheck] = await db.query(`
            SELECT
                up.profile_id,
                CASE WHEN l.loan_id IS NOT NULL THEN 1 ELSE 0 END AS loan_exists
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            LEFT JOIN loans l ON up.profile_id = l.profile_id
                AND l.status IN ('pending', 'approved', 'active')
            WHERE u.email = ?
            LIMIT 1
        `, [email]);

        if (profileCheck.length === 0) {
            return res.status(400).json({ message: "Please complete your profile before applying for a loan", profile_completed: 0, loan_submitted: 0 });
        }

        const { profile_id, loan_exists } = profileCheck[0];

        if (loan_exists === 1) {
            return res.status(400).json({ message: "You already have an active loan application", profile_completed: 1, loan_submitted: 1 });
        }

        const interest_amount = (loan_amount * interest_rate) / 100;
        const total_repayment = Number(loan_amount) + Number(interest_amount);

        const [result] = await db.query(`
            INSERT INTO loans (profile_id, loan_amount, interest_rate, interest_amount, total_repayment, duration_weeks, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [profile_id, loan_amount, interest_rate, interest_amount, total_repayment, duration_weeks]);

        const loan_id = result.insertId;

        // Get user information - using correct column names (username from users table)
        const [userInfo] = await db.query(`
            SELECT u.email, u.username, up.phone
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            WHERE u.email = ?
        `, [email]);

        let userEmailSent = false;
        let adminEmailSent = false;
        let emailError = null;

        if (userInfo.length > 0) {
            const userName = userInfo[0].username;
            const userEmail = userInfo[0].email;
            const userPhone = userInfo[0].phone || 'Not provided';
            const applicationDate = new Date().toLocaleString();
            const formattedLoanAmount = `MWK ${loan_amount.toLocaleString()}`;
            const formattedInterestAmount = `MWK ${interest_amount.toLocaleString()}`;
            const formattedTotalRepayment = `MWK ${total_repayment.toLocaleString()}`;
            const weeklyPayment = total_repayment / duration_weeks;
            const formattedWeeklyPayment = `MWK ${weeklyPayment.toLocaleString()}`;

            // 1. Send confirmation email to USER
            try {
                const userEmailSubject = 'XTData Loan Application Received';
                const userEmailMessage = `
Dear ${userName},

Thank you for choosing XTData Financial Services.

We have received your loan application and our team is reviewing it.

Application Reference: XT-${loan_id}
Date Submitted: ${applicationDate}

Loan Summary
----------------------------------------
Loan Amount: ${formattedLoanAmount}
Interest Rate: ${interest_rate}%
Interest Amount: ${formattedInterestAmount}
Total Repayment: ${formattedTotalRepayment}
Repayment Period: ${duration_weeks} weeks
Weekly Installment: ${formattedWeeklyPayment}

What to Expect

Our loan officers will review your application within 24-48 hours.
You will receive an email once a decision has been made.

Track your application status anytime by logging into your account.

For inquiries, please contact: support@xtdata.com

Yours sincerely,
Loan Processing Department
XDt Financial Services
`;

                await sendEmail(userEmail, userEmailSubject, userEmailMessage);
                userEmailSent = true;
                console.log(`User email sent to: ${userEmail}`);

            } catch (err) {
                console.error('Failed to send user email:', err);
                emailError = err.message;
            }

            // 2. Send notification to ADMIN
            try {
                const adminEmail = process.env.ADMIN_EMAIL || 'admin@xtdata.com';
                const adminEmailSubject = `New Loan Application - XT-${loan_id}`;
                const adminEmailMessage = `
New Loan Application Requires Review

Application ID: XT-${loan_id}
Submitted: ${applicationDate}

Applicant Information
----------------------------------------
Name: ${userName}
Email: ${userEmail}
Phone: ${userPhone}

Loan Details
----------------------------------------
Amount: ${formattedLoanAmount}
Interest Rate: ${interest_rate}%
Interest Amount: ${formattedInterestAmount}
Total Repayment: ${formattedTotalRepayment}
Duration: ${duration_weeks} weeks
Weekly Payment: ${formattedWeeklyPayment}

Action Required
----------------------------------------
Please review this application and update status accordingly.

Approve: PATCH /api/loans/${loan_id}/status { "status": "approved" }
Reject: PATCH /api/loans/${loan_id}/status { "status": "rejected" }

XTData Loan Management System
`;

                await sendEmail(adminEmail, adminEmailSubject, adminEmailMessage);
                adminEmailSent = true;
                console.log(`Admin email sent to: ${adminEmail}`);

            } catch (err) {
                console.error('Failed to send admin email:', err);
                emailError = err.message;
            }
        }

        let responseMessage = "Loan application submitted successfully";
        if (userEmailSent && adminEmailSent) {
            responseMessage += " with email confirmations sent to you and admin.";
        } else if (userEmailSent) {
            responseMessage += " with confirmation email sent to you.";
        }

        return res.status(201).json({
            success: true,
            message: responseMessage,
            loan_id: loan_id,
            profile_completed: 1,
            loan_submitted: 1,
            interest_amount: interest_amount,
            total_repayment: total_repayment,
            email_notifications: {
                user_email_sent: userEmailSent,
                admin_email_sent: adminEmailSent
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET CURRENT ACTIVE LOAN BY EMAIL
// GET /api/loans/current?email=user@example.com
// ===============================
router.get('/current', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: "Email query parameter is required" });

        const [rows] = await db.query(`
            SELECT
                l.loan_id,
                l.loan_amount    AS borrowed,
                l.duration_weeks AS weeks_to_pay,
                l.interest_rate,
                l.interest_amount,
                l.total_repayment AS total_to_pay,
                l.status,
                l.created_at
            FROM users u
            JOIN user_profiles up ON u.user_id    = up.user_id
            JOIN loans l          ON up.profile_id = l.profile_id
            WHERE u.email = ?
              AND l.status IN ('pending', 'approved', 'active')
            ORDER BY l.loan_id DESC
            LIMIT 1
        `, [email]);

        if (rows.length === 0) return res.status(404).json({ message: "No active loan found for this user" });

        const loan = rows[0];
        return res.status(200).json({
            loan_id:         loan.loan_id,
            borrowed:        Number(loan.borrowed),
            weeks_to_pay:    loan.weeks_to_pay,
            total_to_pay:    Number(loan.total_to_pay),
            weekly_payment:  Number(loan.total_to_pay) / loan.weeks_to_pay,
            interest_rate:   Number(loan.interest_rate),
            interest_amount: Number(loan.interest_amount),
            status:          loan.status,
            created_at:      loan.created_at
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// UPDATE LOAN STATUS WITH EMAIL NOTIFICATIONS
// PATCH /api/loans/:loan_id/status
// ===============================
router.patch('/:loan_id/status', async (req, res) => {
    try {
        const { loan_id } = req.params;
        const { status } = req.body;

        const ALLOWED = ['pending', 'approved', 'rejected', 'active', 'completed'];

        if (!status) return res.status(400).json({ message: "status is required" });
        if (!ALLOWED.includes(status)) return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED.join(', ')}` });

        const [existing] = await db.query(`SELECT loan_id, status FROM loans WHERE loan_id = ? LIMIT 1`, [loan_id]);
        if (existing.length === 0) return res.status(404).json({ message: `Loan ${loan_id} not found` });

        const previousStatus = existing[0].status;
        if (['completed', 'rejected'].includes(previousStatus)) {
            return res.status(400).json({ message: `Loan is already ${previousStatus} and cannot be changed` });
        }

        // Get user information - using correct column names
        const [userInfo] = await db.query(`
            SELECT 
                u.email, 
                u.username,
                l.loan_amount,
                l.total_repayment,
                l.duration_weeks,
                l.interest_rate,
                l.interest_amount
            FROM loans l
            JOIN user_profiles up ON l.profile_id = up.profile_id
            JOIN users u ON up.user_id = u.user_id
            WHERE l.loan_id = ?
        `, [loan_id]);

        await db.query(`UPDATE loans SET status = ? WHERE loan_id = ?`, [status, loan_id]);

        let emailSent = false;
        let emailError = null;

        if (userInfo.length > 0) {
            const userEmail = userInfo[0].email;
            const userName = userInfo[0].username;
            const loanAmount = userInfo[0].loan_amount;
            const totalRepayment = userInfo[0].total_repayment;
            const durationWeeks = userInfo[0].duration_weeks;
            const interestRate = userInfo[0].interest_rate;
            const interestAmount = userInfo[0].interest_amount;
            const weeklyPayment = totalRepayment / durationWeeks;
            const formattedAmount = `MWK ${loanAmount.toLocaleString()}`;
            const formattedTotal = `MWK ${totalRepayment.toLocaleString()}`;
            const formattedInterest = `MWK ${interestAmount.toLocaleString()}`;
            const formattedWeekly = `MWK ${weeklyPayment.toLocaleString()}`;

            try {
                if (status === 'approved') {
                    const message = `
Dear ${userName},

Your loan application has been approved.

Loan Reference: XT-${loan_id}
Approved Amount: ${formattedAmount}
Interest Rate: ${interestRate}%
Interest Amount: ${formattedInterest}
Total Repayment: ${formattedTotal}
Repayment Period: ${durationWeeks} weeks
Weekly Installment: ${formattedWeekly}

Next Steps
----------------------------------------
Funds will be disbursed to your registered account within 24 hours.
You will receive a confirmation once the transfer is complete.

For questions, contact: support@xtdata.com

Yours sincerely,
Credit Department
XTData Financial Services
`;
                    await sendEmail(userEmail, 'XTData Loan Application Approved', message);
                    emailSent = true;

                } else if (status === 'rejected') {
                    const message = `
Dear ${userName},

Thank you for your interest in XDt Financial Services.

After careful review of your application (Ref: XT-${loan_id}), we regret to inform you that we cannot approve your loan request at this time.

Application Details
Requested Amount: ${formattedAmount}
Application Date: ${new Date().toLocaleDateString()}

What You Can Do
Ensure all your profile information is up to date
 Contact our support team for more information
You may reapply after 30 days

Need assistance? Contact us at support@xtdata.com

Yours sincerely,
Credit Department
XDt Financial Services
`;
                    await sendEmail(userEmail, 'XTData Loan Application Status Update', message);
                    emailSent = true;
                    
                } else if (status === 'active') {
                    const firstPaymentDue = new Date();
                    firstPaymentDue.setDate(firstPaymentDue.getDate() + 7);
                    
                    const message = `
Dear ${userName},

Your loan has been activated and funds have been disbursed.

Loan Details
Loan Reference: XT-${loan_id}
Principal Amount: ${formattedAmount}
Interest Rate: ${interestRate}%
Interest Amount: ${formattedInterest}
Total to Repay: ${formattedTotal}
Repayment Period: ${durationWeeks} weeks
Weekly Payment: ${formattedWeekly}

Payment Schedule
First Payment Due: ${firstPaymentDue.toLocaleDateString()}
Please ensure timely payments to maintain good credit standing.

Payment Methods Accepted:
Bank Transfer
Airtel Money
TNM Mpamba

For support, contact: payments@xtdata.com

Yours sincerely,
Disbursement Department
XTData Financial Services
`;
                    await sendEmail(userEmail, 'XTData Loan Active - Funds Disbursed', message);
                    emailSent = true;
                    
                } else if (status === 'completed') {
                    const message = `
Dear ${userName},

Congratulations! Your loan has been fully repaid.

Loan Summary
Loan Reference: XT-${loan_id}
Total Repaid: ${formattedTotal}
Completion Date: ${new Date().toLocaleDateString()}

Your responsible repayment history has been recorded. You are now eligible to apply for a new loan with better terms.

Thank you for choosing XTData Financial Services.

We look forward to serving you again.

Yours sincerely,
Loan Servicing Department
XTData Financial Services
`;
                    await sendEmail(userEmail, 'XTData Loan Fully Repaid - Congratulations', message);
                    emailSent = true;
                }
            } catch (err) {
                console.error('Failed to send email notification:', err);
                emailError = err.message;
            }
        }

        let responseMessage = `Loan status updated to '${status}'`;
        if (emailSent) {
            responseMessage += ` and email notification sent`;
        }

        return res.status(200).json({
            success: true,
            message: responseMessage,
            loan_id: Number(loan_id),
            previous_status: previousStatus,
            new_status: status,
            email_notification_sent: emailSent
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET ALL USERS WITH INCOMPLETE LOANS
// GET /api/loans/incomplete-users
// ===============================
router.get('/incomplete-users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [rows] = await db.query(`
            SELECT DISTINCT
                u.user_id,
                u.username,
                u.email,
                l.loan_id,
                l.loan_amount,
                l.total_repayment,
                l.duration_weeks,
                l.status,
                l.created_at
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            JOIN loans l ON up.profile_id = l.profile_id
            WHERE l.status != 'completed'
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [totalResult] = await db.query(`
            SELECT COUNT(DISTINCT l.loan_id) as total 
            FROM loans l 
            WHERE l.status != 'completed'
        `);

        const total = totalResult[0].total;

        return res.status(200).json({
            success: true,
            message: rows.length === 0 ? "No incomplete loan applications found" : "Users fetched successfully",
            data: rows,
            pagination: {
                current_page: page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                items_per_page: limit
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET TOTAL ACTIVE LOAN APPLICATIONS
// GET /api/loans/total-active
// ===============================
router.get('/total-active', async (req, res) => {
    try {
        const [result] = await db.query(`
            SELECT COUNT(*) as total 
            FROM loans 
            WHERE status != 'completed'
        `);

        const totalActiveLoans = result[0].total;

        return res.status(200).json({
            success: true,
            message: "Total active loan applications retrieved successfully",
            total: totalActiveLoans,
            status_filter: "not completed"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET TOTAL APPROVED LOANS
// GET /api/loans/total-approved
// ===============================
router.get('/total-approved', async (req, res) => {
    try {
        const [result] = await db.query(`
            SELECT COUNT(*) as total 
            FROM loans 
            WHERE status = 'approved'
        `);

        const totalApprovedLoans = result[0].total;

        return res.status(200).json({
            success: true,
            message: "Total approved loans retrieved successfully",
            total: totalApprovedLoans,
            status: "approved"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET TOTAL ACTIVE LOANS (status = 'active')
// GET /api/loans/total-active-loans
// ===============================
router.get('/total-active-loans', async (req, res) => {
    try {
        const [result] = await db.query(`
            SELECT COUNT(*) as total 
            FROM loans 
            WHERE status = 'active'
        `);

        const totalActiveStatusLoans = result[0].total;

        return res.status(200).json({
            success: true,
            message: "Total active loans (status = 'active') retrieved successfully",
            total: totalActiveStatusLoans,
            status: "active"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET LOAN SUMMARY
// GET /api/loans/summary
// ===============================
router.get('/summary', async (req, res) => {
    try {
        const [totalResult] = await db.query(`SELECT COUNT(*) as total FROM loans`);
        const [approvedResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status = 'approved'`);
        const [activeResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status = 'active'`);
        const [pendingResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status = 'pending'`);
        const [rejectedResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status = 'rejected'`);
        const [completedResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status = 'completed'`);
        const [notCompletedResult] = await db.query(`SELECT COUNT(*) as total FROM loans WHERE status != 'completed'`);

        return res.status(200).json({
            success: true,
            message: "Loan summary retrieved successfully",
            data: {
                total_loans: totalResult[0].total,
                approved_loans: approvedResult[0].total,
                active_loans: activeResult[0].total,
                pending_loans: pendingResult[0].total,
                rejected_loans: rejectedResult[0].total,
                completed_loans: completedResult[0].total,
                not_completed_loans: notCompletedResult[0].total
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ===============================
// GET LOAN HISTORY FOR USER
// GET /api/loans/history?email=user@example.com
// ===============================
router.get('/history', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ message: "Email query parameter is required" });

        const [rows] = await db.query(`
            SELECT
                l.loan_id,
                l.loan_amount,
                l.interest_rate,
                l.interest_amount,
                l.total_repayment,
                l.duration_weeks,
                l.status,
                l.created_at,
                CASE 
                    WHEN l.status = 'completed' THEN l.updated_at
                    ELSE NULL
                END as completed_at
            FROM users u
            JOIN user_profiles up ON u.user_id = up.user_id
            JOIN loans l ON up.profile_id = l.profile_id
            WHERE u.email = ?
            ORDER BY l.created_at DESC
        `, [email]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "No loan history found for this user" });
        }

        return res.status(200).json({
            success: true,
            total: rows.length,
            data: rows.map(loan => ({
                ...loan,
                loan_amount: Number(loan.loan_amount),
                interest_amount: Number(loan.interest_amount),
                total_repayment: Number(loan.total_repayment),
                weekly_payment: Number(loan.total_repayment) / loan.duration_weeks
            }))
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});
// ===============================
// DELETE LOAN (EVEN IF APPROVED)
// DELETE /api/loans/:loan_id
// ===============================
router.delete('/:loan_id', async (req, res) => {
    try {
        const { loan_id } = req.params;
        const { reason, deleted_by } = req.body; // optional: log who deleted and why

        // Check loan exists and get details
        const [existing] = await db.query(`
            SELECT 
                l.loan_id,
                l.status,
                l.loan_amount,
                u.email,
                u.username
            FROM loans l
            JOIN user_profiles up ON l.profile_id = up.profile_id
            JOIN users u ON up.user_id = u.user_id
            WHERE l.loan_id = ?
            LIMIT 1
        `, [loan_id]);

        if (existing.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: `Loan XT-${loan_id} not found` 
            });
        }

        const loan = existing[0];

        // Only block deletion of already-completed loans (optional — remove if you want full delete)
        if (loan.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: `Loan XT-${loan_id} is already completed and cannot be deleted. Contact system admin.`
            });
        }

        // Delete the loan
        await db.query(`DELETE FROM loans WHERE loan_id = ?`, [loan_id]);

        // Send email notification to user
        try {
            const deletionReason = reason || 'collateral not provided or application requirements not met';
            const message = `
Dear ${loan.username},

Your loan application (Ref: XT-${loan_id}) has been removed from our system.

Loan Details
----------------------------------------
Loan Reference: XT-${loan_id}
Amount: MWK ${Number(loan.loan_amount).toLocaleString()}
Previous Status: ${loan.status}
Removal Date: ${new Date().toLocaleDateString()}

Reason
----------------------------------------
${deletionReason}

What You Can Do
----------------------------------------
- Ensure you have all required collateral documents ready
- Contact our office for clarification: support@xtdata.com
- You may reapply once you have met all requirements

We hope to assist you again in the future.

Yours sincerely,
Loan Processing Department
XTData Financial Services
`;
            await sendEmail(loan.email, 'XTData Loan Application Removed', message);
        } catch (emailErr) {
            console.error('Failed to send deletion email:', emailErr.message);
            // Don't fail the request if email fails
        }

        return res.status(200).json({
            success: true,
            message: `Loan XT-${loan_id} has been successfully deleted`,
            deleted_loan: {
                loan_id: Number(loan_id),
                previous_status: loan.status,
                user_email: loan.email,
                reason: reason || 'No reason provided'
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;