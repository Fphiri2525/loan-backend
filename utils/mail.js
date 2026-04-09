console.log('📧 Loading email service (Resend)...');
console.log('🔍 RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('🔍 EMAIL_FROM:', process.env.EMAIL_FROM || 'XDT Financial Associates <no-reply@xtdata.com>');

if (!process.env.RESEND_API_KEY) {
  throw new Error('❌ Missing RESEND_API_KEY in environment variables');
}

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, text) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 Attempting to send email...');
  console.log('📤 To:     ', to);
  console.log('📤 Subject:', subject);
  console.log('📤 From:   ', process.env.EMAIL_FROM || 'XDT Financial Associates <no-reply@xtdata.com>');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'XDT Financial Associates <no-reply@xtdata.com>',
      to: Array.isArray(to) ? to : [to], // ensure `to` is always an array
      subject,
      text,
    });

    console.log('✅ Email sent successfully!');
    console.log('✅ Email ID:', data.id || 'undefined');
    return data;

  } catch (err) {
    console.error('❌ Email send failed!');
    console.error('❌ Error message:', err.message);
    console.error('❌ Full error:', JSON.stringify(err, null, 2));
    throw err;
  }
};

module.exports = sendEmail;