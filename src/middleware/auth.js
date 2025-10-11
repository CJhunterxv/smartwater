// src/middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ ok: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ ok: false, message: "Invalid token" });

    req.user = { id: user._id, role: user.role };
    next();
  } catch (err) {
    res.status(401).json({ ok: false, message: "Auth failed" });
  }
};

export default authMiddleware;   // ✅ default export



