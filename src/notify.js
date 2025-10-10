import nodemailer from "nodemailer";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

// === Email Transport ===
const transporter = nodemailer.createTransport({
  service: "gmail", // you can change to "outlook" or another provider if needed
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // must be an App Password for Gmail
  },
});

// === Send Email Alert ===
export async function sendEmailAlert(subject, message) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL,
      subject,
      text: message,
    });
    console.log("✅ Email alert sent");
  } catch (err) {
    console.error("❌ Email alert failed:", err.message);
  }
}

// === Send SMS Alert (Twilio) ===
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMSAlert(message) {
  try {
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER, // your Twilio trial number
      to: process.env.ALERT_PHONE,           // your verified phone number
    });
    console.log("✅ SMS sent, SID:", sms.sid);
  } catch (err) {
    console.error("❌ SMS alert failed:", err.message);
  }
}
