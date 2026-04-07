const express = require('express');
const router = express.Router();
const sendEmail = require('../utils/mail');

// API to send admin notification when someone applies for a loan
router.post('/admin-notification', async (req, res) => {
    try {
        const { userEmail, userName, loanAmount, loanDuration, applicationDate, loanId } = req.body;

        // Validate required fields
        if (!userEmail || !userName || !loanAmount) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: userEmail, userName, loanAmount'
            });
        }

        console.log('==========================');
        console.log('📩 ADMIN NOTIFICATION STARTED');
        console.log('Admin Email:', process.env.EMAIL_USER);
        console.log('Applicant Email:', userEmail);
        console.log('Applicant Name:', userName);
        console.log('Loan Amount:', loanAmount);
        console.log('Loan Duration:', loanDuration, 'weeks');
        console.log('Time:', new Date().toISOString());
        console.log('==========================');

        // Create detailed email content for admin
        const adminEmailContent = `
🔔 NEW LOAN APPLICATION ALERT 🔔

Dear Admin,

A new loan application has been submitted on the XTData Loan Platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 APPLICATION DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Applicant Name: ${userName}
Applicant Email: ${userEmail}
Loan Amount: MWK ${loanAmount.toLocaleString()}
Loan Duration: ${loanDuration || 'Not specified'} weeks
Application Date: ${applicationDate || new Date().toLocaleString()}
Loan Reference ID: ${loanId || 'Pending'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please log in to the admin dashboard to:
✅ Review the application details
✅ Verify applicant's information
✅ Approve or reject the loan
✅ Process the disbursement if approved

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Quick Actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Review Application: http://localhost:3000/admin/loans/${loanId || 'pending'}
• View All Applications: http://localhost:3000/admin/loans
• Contact Applicant: mailto:${userEmail}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is an automated notification from XTData Loan Platform.

Best regards,
XTData Loan System
`;

        // Send email to admin
        await sendEmail(
            'fphiri418@gmail.com',  // Admin email address
            `🔔 NEW LOAN APPLICATION - ${userName} applied for MWK ${loanAmount.toLocaleString()}`,
            adminEmailContent
        );

        console.log('✅ ADMIN NOTIFICATION SENT SUCCESSFULLY TO: fphiri418@gmail.com');
        console.log('   Applicant:', userName, `(${userEmail})`);

        res.json({
            success: true,
            message: 'Admin notification sent successfully',
            sentTo: 'fphiri418@gmail.com',
            applicant: {
                name: userName,
                email: userEmail,
                amount: loanAmount
            }
        });

    } catch (error) {
        console.log('❌ ADMIN NOTIFICATION FAILED:', error.message);
        console.log('Full error:', error);

        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to send admin notification'
        });
    }
});

// Optional: API to test admin notification
router.get('/test-admin-notification', async (req, res) => {
    try {
        console.log('Testing admin notification...');
        
        await sendEmail(
            'fphiri418@gmail.com',
            'TEST: Admin Notification System',
            `This is a test notification to verify that the admin email system is working correctly.

Test Details:
• Time: ${new Date().toLocaleString()}
• System: XTData Loan Platform
• Status: Admin notification system is operational

If you receive this email, the admin notification system is working properly.

Best regards,
XTData System`
        );

        res.json({
            success: true,
            message: 'Test admin notification sent to fphiri418@gmail.com'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;