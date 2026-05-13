// models/DoctorEmailOTPModel.js
const mongoose = require("mongoose");

const emailOTPSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  email: { type: String, required: true, lowercase: true, trim: true },
  newEmail: { type: String, required: true, lowercase: true, trim: true },
  otpCode: { type: String, required: true },
  verificationToken: { type: String, required: true, unique: true },
  isVerified: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now },
});

emailOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOTPSchema.index({ doctorId: 1, verificationToken: 1 });

module.exports = mongoose.model("DoctorEmailOTP", emailOTPSchema, "DoctorEmailOTP");

