import nodemailer from "nodemailer";

// Function to send OTP email
export const sendOTPEmail = async (to, otp) => {
  try {
    // Create transporter using Gmail + App Password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,   // your Gmail address
        pass: process.env.EMAIL_PASS    // your Gmail App Password
      },
    });

    // Email details
    const mailOptions = {
      from: `"SmartWater Alerts" <${process.env.EMAIL_USER}>`,
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
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending OTP email:", err.message);
    throw err;
  }
};
