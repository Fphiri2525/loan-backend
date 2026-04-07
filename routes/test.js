const express = require('express');
const router = express.Router();
const sendEmail = require('../utils/mail');

router.post('/test-email', async (req, res) => {
    try {
        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        console.log('==========================');
        console.log('📩 TEST EMAIL STARTED');
        console.log('Sender:', process.env.EMAIL_USER);
        console.log('Receiver:', email);
        console.log('Time:', new Date().toISOString());
        console.log('==========================');

        await sendEmail(
            email,
            'Thank You for Applying – XTData Loan Platform',
            `Dear ${name || 'Valued Customer'},\n\nThank you for applying to XTData Loan Platform, your trusted loan management platform.\n\nYour application has been received and is currently under review. Our team will get back to you shortly with feedback.\n\nIf you have any questions, feel free to contact us at any time.\n\nWarm regards,\nXTData Loan Platform Team`
        );

        console.log('✅ EMAIL SENT SUCCESSFULLY TO:', email);

        res.json({
            success: true,
            message: `Email sent successfully to ${email}`
        });

    } catch (error) {
        console.log('❌ EMAIL FAILED:', error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;