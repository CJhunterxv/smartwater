import nodemailer from "nodemailer";

// Function to send OTP email
export const sendOTPEmail = async (to, otp) => {
  try {
    // ✅ Unified transporter using GMAIL_USER + GMAIL_APP_PASSWORD
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"SmartWater Alerts" <${process.env.GMAIL_USER}>`,
      to,
      subject: "SmartWater Email Verification",
      text: `Your OTP code is: ${otp}. It will expire in 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>SmartWater Email Verification</h2>
          <p>Your OTP code is:</p>
          <h1 style="color: #2e86de;">${otp}</h1>
          <p>This code will expire in <b>5 minutes</b>.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending OTP email:", err.message);
    throw err;
  }
};
