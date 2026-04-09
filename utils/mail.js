if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new Error('❌ Missing EMAIL_USER or EMAIL_PASS in environment variables');
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.error('❌ SMTP connection failed:', err.message);
  else console.log('✅ SMTP ready — connected to Gmail');
});

const sendEmail = async (to, subject, text) => {
  console.log('📤 Sending email to:', to);
  console.log('📤 Using sender:', process.env.EMAIL_USER);

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    console.log('📨 Gmail response:', info.response);
    console.log('📨 Message ID:', info.messageId);
    return info;
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    throw err;
  }
};

module.exports = sendEmail;