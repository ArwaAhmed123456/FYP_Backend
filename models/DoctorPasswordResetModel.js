// models/DoctorPasswordResetModel.js
const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    resetToken: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => Date.now() + 3600000, // 1 hour from now
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index to auto-delete expired tokens after 2 hours
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.model("Doctor_PasswordResetToken", passwordResetSchema, "Doctor_PasswordResetToken");

