import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getLatestValues, setVariable } from "./arduinoCloud.js";
import { sendEmailAlert, sendSMSAlert } from "./notify.js";
import { sendOTPEmail } from "./mailer.js"; // kept for user email verification & password reset
import mongoose from "mongoose";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import AdminLog from "./models/adminlog.js";

dotenv.config();

// === CONNECT TO MONGODB ===
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// === MODEL FOR LOGGING SENSOR DATA ===
const logSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  waterDetected: Boolean,
  distanceCM: Number,
});
const Log = mongoose.model("Log", logSchema);

// === NODEMAILER TRANSPORTER (Contact Form) ===
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ==========================================================
// === CLEAN URL ROUTES (serve HTML pages without .html) ===
// ==========================================================
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "register.html"));
});

app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "verify.html"));
});

app.get("/reset-password-page", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "reset.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

// In-memory logs
const logs = [];
let lastAlert = null;

// === USER REGISTRATION (POST /users) ===
app.post("/users", async (req, res) => {
  try {
    let { name, surname, email, phone, location, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Email and password are required." });
    }
    email = email.trim().toLowerCase();

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.json({ ok: false, message: "User already exists. Do you want to edit instead?" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 999999));
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    const newUser = new User({
      name, surname, email, phone, location,
      password: hashedPassword,
      otp, otpExpiry,
      isVerified: false
    });

    await newUser.save();
    await sendOTPEmail(email, otp);

    res.json({ ok: true, message: "User registered. Please verify OTP sent to your email." });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ ok: false, message: "Server error during registration." });
  }
});

// === VERIFY OTP (POST /verify-otp) ===
app.post("/verify-otp", async (req, res) => {
  try {
    let { email, otp } = req.body;
    if (!email || !otp) return res.json({ ok: false, message: "Email and OTP are required" });

    email = email.trim().toLowerCase();
    otp = String(otp).trim();

    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: false, message: "User not found" });
    if (user.isVerified) return res.json({ ok: true, message: "User already verified" });

    if (String(user.otp) !== otp) return res.json({ ok: false, message: "Invalid OTP" });
    if (Date.now() > Number(user.otpExpiry)) return res.json({ ok: false, message: "OTP expired" });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ ok: true, message: "Email verified successfully. You can now log in." });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ ok: false, message: "Server error during OTP verification" });
  }
});

// === LOGIN (POST /login) ===
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, message: "Email and password are required." });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return res.json({ ok: false, message: "User not found." });
    if (!user.isVerified) return res.json({ ok: false, message: "Please verify your email before logging in." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.json({ ok: false, message: "Invalid password." });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ ok: true, message: "Login successful", token, role: user.role });
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ ok: false, message: "Server error during login." });
  }
});

// === ADMIN REQUEST WORKFLOW ===

// 1. User requests admin access
app.post("/api/admins/request", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.json({ ok: false, message: "User not found" });
    if (user.role === "admin") return res.json({ ok: false, message: "Already an admin" });

    user.pendingAdmin = true;
    await user.save();

    res.json({ ok: true, message: "Request sent to admin" });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// 2. Admin views pending requests
app.get("/api/admins/requests", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (!admin || admin.role !== "admin") return res.json({ ok: false, message: "Not authorized" });

    const pending = await User.find({ pendingAdmin: true }, "email name surname");
    res.json({ ok: true, requests: pending });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// 3. Admin approves request (direct promotion, with logging)
app.post("/api/admins/approve", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (!admin || admin.role !== "admin") return res.json({ ok: false, message: "Not authorized" });

    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.json({ ok: false, message: "User not found" });

    if (user.role === "admin") {
      return res.json({ ok: false, message: "User is already an admin" });
    }

    user.role = "admin";
    user.pendingAdmin = false;
    await user.save();

    // Log promotion
    await AdminLog.create({
      action: "promote",
      targetUser: user._id,
      targetEmail: user.email,
      performedBy: admin._id,
      performedByEmail: admin.email,
      timestamp: new Date()
    });

    res.json({ ok: true, message: "User approved and promoted to admin" });
  } catch (err) {
    console.error("Approve request error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// 4. Admin removes another admin (demote back to user, with logging)
app.post("/api/admins/remove", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (!admin || admin.role !== "admin") return res.json({ ok: false, message: "Not authorized" });

    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.json({ ok: false, message: "User not found" });

    if (user.role !== "admin") {
      return res.json({ ok: false, message: "User is not an admin" });
    }

    user.role = "user";
    user.pendingAdmin = false;
    user.adminOtp = undefined;
    await user.save();

    // Log demotion
    await AdminLog.create({
      action: "demote",
      targetUser: user._id,
      targetEmail: user.email,
      performedBy: admin._id,
      performedByEmail: admin.email,
      timestamp: new Date()
    });

    res.json({ ok: true, message: "Admin rights removed" });
  } catch (err) {
    console.error("Remove admin error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// 5. View Admin Action Logs
app.get("/api/admins/logs", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.id);
    if (!admin || admin.role !== "admin") {
      return res.json({ ok: false, message: "Not authorized" });
    }

    const actionLogs = await AdminLog.find().sort({ timestamp: -1 }).limit(100);
    res.json({ ok: true, logs: actionLogs });
  } catch (err) {
    console.error("Error fetching admin logs:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// === STATUS (GET /status) ===
app.get("/status", async (req, res) => {
  try {
    const values = await getLatestValues();
    const pumpState = !!values.pumpState;
    const buzzerState = !!values.buzzerState;
    const waterDetected = !!values.waterDetected;
    const distanceCM = values.distanceCM ?? values.distance ?? 0;
    const timestamp = new Date().toISOString();

    // Save to logs collection
    new Log({ waterDetected, distanceCM }).save().catch(console.error);

    // Push to in-memory logs
    logs.push({ timestamp, pumpState, buzzerState, waterDetected, distanceCM });

    if (waterDetected) {
      const alertMsg = `⚠️ SmartWater Alert: Water detected at ${timestamp}, distance=${distanceCM}cm`;
      sendEmailAlert("SmartWater Alert", alertMsg).catch(console.error);
      sendSMSAlert(alertMsg).catch(console.error);
      lastAlert = timestamp;
    }

    res.json({
      ok: true,
      data: {
        pumpState,
        buzzerState,
        waterDetected,
        distanceCM,
        manualOverride: pumpState || buzzerState,
        lastUpdate: timestamp,
        lastAlert
      }
    });
  } catch (err) {
    console.error("Error fetching Arduino values:", err);
    res.status(500).json({ ok: false, message: "Server error fetching status." });
  }
});

// === HISTORICAL DATA ===
app.get("/historical-data", async (req, res) => {
  const { range } = req.query;
  let startDate;

  if (range === "month") {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === "6months") {
    startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  } else {
    return res.status(400).json({ ok: false, message: "Invalid time range" });
  }

  try {
    const logsDocs = await Log.find({ timestamp: { $gte: startDate } }).sort({ timestamp: "asc" });
    const labels = logsDocs.map(log => log.timestamp);
    const distanceData = logsDocs.map(log => log.distanceCM);
    const waterData = logsDocs.map(log => (log.waterDetected ? 1 : 0));

    res.json({
      ok: true,
      labels,
      datasets: {
        distance: distanceData,
        water: waterData,
      },
    });
  } catch (err) {
    console.error("Error fetching historical data:", err);
    res.status(500).json({ ok: false, message: "Server error fetching historical logs." });
  }
});

// === CONTROLS ===
app.post("/control/pump", async (req, res) => {
  try {
    await setVariable(process.env.ARDUINO_PUMP_VAR_ID, !!req.body.on);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error setting Pump:", err);
    res.status(500).json({ ok: false, message: "Server error setting pump." });
  }
});

app.post("/control/buzzer", async (req, res) => {
  try {
    await setVariable(process.env.ARDUINO_BUZZER_VAR_ID, !!req.body.on);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error setting Buzzer:", err);
    res.status(500).json({ ok: false, message: "Server error setting buzzer." });
  }
});

// === LOG DOWNLOAD ===
app.get("/download-logs", (req, res) => {
  const csv = [
    "timestamp,pumpState,buzzerState,waterDetected,distanceCM",
    ...logs.map(l => `${l.timestamp},${l.pumpState},${l.buzzerState},${l.waterDetected},${l.distanceCM}`)
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=smartwater_logs.csv");
  res.send(csv);
});

// === USERS LIST ===
app.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ ok: true, users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ ok: false, message: "Server error fetching users." });
  }
});

// === RESEND OTP ===
app.post("/resend-otp", async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, message: "Email is required." });

    email = email.trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: false, message: "User not found." });
    if (user.isVerified) return res.json({ ok: false, message: "Already verified." });

    const otp = String(crypto.randomInt(100000, 999999));
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendOTPEmail(email, otp);
    res.json({ ok: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("Error sending/resending OTP:", err);
    res.status(500).json({ ok: false, message: "Server error sending OTP." });
  }
});

// === CONTACT FORM EMAIL ===
app.post("/send-email", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, error: "All fields are required." });
    }

    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: "calenwent@gmail.com",
      subject: `Contact Form: ${subject}`,
      text: `New message from: ${name} (${email})\n\n${message}`,
      replyTo: email
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    console.error("Error in /send-email endpoint:", err);
    res.status(500).json({ success: false, error: "Failed to send email." });
  }
});

// === AI CHAT ===
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const response = await fetch(
      "https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-1B-Instruct",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.HF_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: message })
      }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.json({ reply: "Hugging Face returned non‑JSON: " + text });
    }

    if (data.error) {
      return res.json({ reply: "Hugging Face Error: " + data.error });
    }

    const reply = Array.isArray(data)
      ? data[0]?.generated_text || "No response"
      : data.generated_text || "No response";

    res.json({ reply });
  } catch (err) {
    console.error("Error in /chat (HF):", err);
    res.status(500).json({ reply: "Error connecting to Hugging Face AI" });
  }
});

// === FORGOT PASSWORD ===
app.post("/forgot-password", async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) return res.json({ ok: false, message: "Email is required" });

    email = email.trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: false, message: "User not found" });

    const otp = String(crypto.randomInt(100000, 999999));
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOTPEmail(email, otp);
    res.json({ ok: true, message: "Password reset OTP sent to your email." });
  } catch (err) {
    console.error("Error in forgot-password:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// === RESET PASSWORD ===
app.post("/reset-password", async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.json({ ok: false, message: "Email, OTP, and new password are required" });
    }

    email = email.trim().toLowerCase();
    otp = String(otp).trim();

    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: false, message: "User not found" });

    if (String(user.otp) !== otp || Date.now() > Number(user.otpExpiry)) {
      return res.json({ ok: false, message: "Invalid or expired OTP" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ ok: true, message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("Error in reset-password:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`✅ SmartWater backend running on port ${PORT}`);
});


