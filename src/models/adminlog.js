// models/adminLog.js
import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema({
  action: { type: String, enum: ["promote", "demote"], required: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  targetEmail: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  performedByEmail: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model("AdminLog", adminLogSchema);
