console.log('📧 Loading email service...');
console.log('🔍 EMAIL_USER:', process.env.EMAIL_USER ? `${process.env.EMAIL_USER.slice(0, 4)}****` : 'NOT SET');
console.log('🔍 EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ SET' : '❌ NOT SET');
console.log('🔍 EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET (will use EMAIL_USER)');
console.log('🔍 MAIL_HOST:', process.env.MAIL_HOST || 'NOT SET (using hardcoded smtp.gmail.com)');
console.log('🔍 MAIL_PORT:', process.env.MAIL_PORT || 'NOT SET (using hardcoded 587)');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new Error('❌ Missing EMAIL_USER or EMAIL_PASS in environment variables');
}

const nodemailer = require('nodemailer');

const MAIL_HOST = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT = parseInt(process.env.MAIL_PORT) || 587;

console.log(`🔌 Creating transporter — host: ${MAIL_HOST}, port: ${MAIL_PORT}`);

const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: false,
  requireTLS: true,
  family: 4,          // 👈 force IPv4 — fixes ENETUNREACH on Railway
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  logger: true,
  debug: true,
});

// Verify connection at startup
console.log('🔄 Verifying SMTP connection...');
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP connection failed!');
    console.error('❌ Error code:', err.code);
    console.error('❌ Error message:', err.message);
    console.error('❌ Full error:', JSON.stringify(err, null, 2));
  } else {
    console.log('✅ SMTP connection verified — ready to send emails');
    console.log('✅ Verify result:', success);
  }
});

const sendEmail = async (to, subject, text) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 Attempting to send email...');
  console.log('📤 To:     ', to);
  console.log('📤 Subject:', subject);
  console.log('📤 From:   ', process.env.EMAIL_FROM || process.env.EMAIL_USER);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    console.log('✅ Email sent successfully!');
    console.log('✅ Message ID :', info.messageId);
    console.log('✅ Response   :', info.response);
    console.log('✅ Accepted   :', info.accepted);
    console.log('✅ Rejected   :', info.rejected);
    return info;

  } catch (err) {
    console.error('❌ Email send failed!');
    console.error('❌ Error code   :', err.code);
    console.error('❌ Error message:', err.message);
    console.error('❌ Response code:', err.responseCode);
    console.error('❌ Response     :', err.response);
    console.error('❌ Full error   :', JSON.stringify(err, null, 2));
    throw err;
  }
};

module.exports = sendEmail;