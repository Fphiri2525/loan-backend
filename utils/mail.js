const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (to, subject, text) => {
    console.log('📤 Preparing transporter...');
    console.log('Using sender:', process.env.EMAIL_USER);

    const info = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    });

    console.log('📨 Gmail response:', info.response);
};

module.exports = sendEmail;