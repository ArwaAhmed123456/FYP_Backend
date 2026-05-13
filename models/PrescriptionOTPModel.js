// models/PrescriptionOTPModel.js
const mongoose = require("mongoose");

const prescriptionOTPSchema = new mongoose.Schema(
  {
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient_Prescription",
      required: true,
      index: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    otpCode: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 5
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries
prescriptionOTPSchema.index({ prescriptionId: 1, doctorId: 1, verified: 1 });
prescriptionOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  "Prescription_OTP",
  prescriptionOTPSchema,
  "Prescription_OTP"
);

