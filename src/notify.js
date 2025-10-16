import nodemailer from "nodemailer";
import twilio from "twilio";
import dotenv from "dotenv";
import User from "./models/User.js"; // Access MongoDB users

dotenv.config();

// === Email Transport (Unified with OTP) ===
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,          // same as OTP
    pass: process.env.GMAIL_APP_PASSWORD,  // same as OTP
  },
});

// === Send Email Alert to All Verified Users ===
export async function sendEmailAlert(subject, message) {
  try {
    const users = await User.find({ isVerified: true }, "email");
    for (const user of users) {
      await transporter.sendMail({
        from: `"SmartWater Alerts" <${process.env.GMAIL_USER}>`,
        to: user.email,
        subject,
        text: message,
      });
      console.log(`✅ Email sent to ${user.email}`);
    }
  } catch (err) {
    console.error("❌ Email alert failed:", err);
  }
}

// === Twilio Client ===
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// === Send SMS Alert to All Verified Users ===
export async function sendSMSAlert(message) {
  try {
    const users = await User.find({ isVerified: true }, "phone");
    for (const user of users) {
      if (!user.phone) continue;
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
      });
      console.log(`✅ SMS sent to ${user.phone}`);
    }
  } catch (err) {
    console.error("❌ SMS alert failed:", err);
  }
}
