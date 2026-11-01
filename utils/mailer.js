/**
 * Optional email sender. Does nothing (returns false) unless SMTP_HOST is set in .env,
 * so the app works fine without any email configuration.
 */
async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_HOST || !to) return false;
  try {
    const nodemailer = require("nodemailer");
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  } catch (err) {
    console.error("Mail error:", err.message);
    return false;
  }
}

module.exports = { sendMail };
