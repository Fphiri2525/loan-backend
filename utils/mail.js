console.log('📧 Loading email service...');
console.log('🔍 EMAIL_USER:', process.env.EMAIL_USER ? `${process.env.EMAIL_USER.slice(0, 4)}****` : 'NOT SET');
console.log('🔍 EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ SET' : '❌ NOT SET');
console.log('🔍 EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET (will use EMAIL_USER)');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new Error('❌ Missing EMAIL_USER or EMAIL_PASS in environment variables');
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,        // 👈 changed to 465
  secure: true,     // 👈 true for 465
  requireTLS: false,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  logger: true,
  debug: true,
});

console.log('🔌 Transporter created — host: smtp.gmail.com, port: 465');
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