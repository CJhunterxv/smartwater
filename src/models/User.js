import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  phone: { type: String, required: true }, // format: +27...
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  location: { type: String, required: true },
  password: { type: String, required: true }, // hashed with bcrypt
  isVerified: { type: Boolean, default: false }, // after OTP
  role: { type: String, enum: ["user", "admin"], default: "user" },

  // 🔑 OTP fields
  otp: { type: String },            // store OTP as string
  otpExpiry: { type: Number },      // store expiry as epoch ms (Number)

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("User", userSchema);
