// models/SupportRequestModel.js
const mongoose = require("mongoose");

const supportRequestSchema = new mongoose.Schema(
  {
    // User type: 'doctor' or 'patient' (automatically determined)
    userType: {
      type: String,
      enum: ["doctor", "patient"],
      required: false, // Will be set automatically based on which ID is provided
      index: true,
    },
    // Doctor ID (required if userType is 'doctor')
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      default: null,
      index: true,
    },
    // Patient ID (required if userType is 'patient')
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved"],
      default: "open",
      index: true,
    },
    // Context information (optional)
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocAppointment",
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    issueType: {
      type: String,
      enum: ["general", "payment", "payout", "earnings_mismatch", "refund", "appointment", "prescription", "technical", "other"],
      default: "general",
    },
    // Contact email for replies (optional; from patient/doctor when creating request)
    contactEmail: {
      type: String,
      trim: true,
      default: null,
    },
    // Admin response
    adminResponse: {
      type: String,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    // Unread tracking for chat: last admin reply & last time user viewed conversation
    lastAdminMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastUserSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Validation and auto-set userType: At least one of doctorId or patientId must be provided
// Automatically set userType based on which ID is provided
supportRequestSchema.pre('validate', function(next) {
  if (!this.doctorId && !this.patientId) {
    return next(new Error('Either doctorId or patientId must be provided'));
  }
  
  // Automatically determine userType based on which ID is provided
  if (this.doctorId && !this.patientId) {
    this.userType = 'doctor';
  } else if (this.patientId && !this.doctorId) {
    this.userType = 'patient';
  } else if (this.doctorId && this.patientId) {
    // If both are provided, prioritize doctorId (or you could throw an error)
    this.userType = 'doctor';
    this.patientId = null; // Clear patientId if doctorId is present
  }
  
  next();
});

// Indexes for efficient queries
supportRequestSchema.index({ doctorId: 1, createdAt: -1 });
supportRequestSchema.index({ patientId: 1, createdAt: -1 });
supportRequestSchema.index({ userType: 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });
supportRequestSchema.index({ userType: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("SupportRequest", supportRequestSchema, "SupportRequests");

