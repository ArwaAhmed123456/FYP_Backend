// models/PatientPrescriptionModel.js
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  time: { type: String, required: true }, // "08:00"
  taken: { type: Boolean, default: false },
  takenAt: { type: Date, default: null },
  skipped: { type: Boolean, default: false }
}, { _id: false });

const adherenceLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  time: { type: String, required: true },
  taken: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const patientPrescriptionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor_appointment"
    },
    // Legacy single medication fields (for backward compatibility)
    medicationName: {
      type: String,
      trim: true
    },
    dosage: {
      type: String,
      trim: true
    },
    frequency: {
      type: String,
      trim: true // ex: "2 times/day"
    },
    instructions: {
      type: String,
      default: ""
    },
    // New fields to support multiple medications (like E_Prescription)
    medications: [{
      name: { type: String, required: true, trim: true },
      dosage: { type: String, required: true, trim: true },
      frequency: { type: String, required: true, trim: true },
      instructions: { type: String, default: "" }
    }],
    diagnosis: {
      type: String,
      default: "",
      trim: true
    },
    notes: {
      type: String,
      default: "",
      trim: true
    },
    pdfUrl: {
      type: String,
      default: null
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    reminders: [reminderSchema],
    adherenceLog: [adherenceLogSchema],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    previousVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient_Prescription",
      default: null
    },
    // Signature fields for legal compliance
    signedByDoctor: {
      type: Boolean,
      default: false,
      index: true
    },
    signedAt: {
      type: Date,
      default: null
    },
    signatureHash: {
      type: String,
      default: null
    },
    signatureIP: {
      type: String,
      default: null
    },
    signatureDevice: {
      type: String,
      default: null
    },
    signatureVersion: {
      type: Number,
      default: 1
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
patientPrescriptionSchema.index({ patientId: 1, isActive: 1, isDeleted: 1 });
patientPrescriptionSchema.index({ patientId: 1, isDeleted: 1, isActive: 1, endDate: 1 }); // Optimized for patient view with active filter
patientPrescriptionSchema.index({ doctorId: 1, isActive: 1, isDeleted: 1 });
patientPrescriptionSchema.index({ appointmentId: 1 });
patientPrescriptionSchema.index({ createdAt: -1 });
patientPrescriptionSchema.index({ endDate: 1, isActive: 1 });

// Pre-save hook to auto-deactivate expired prescriptions
patientPrescriptionSchema.pre('save', function(next) {
  if (this.endDate && new Date(this.endDate) < new Date() && this.isActive) {
    this.isActive = false;
  }
  next();
});

// Method to calculate adherence percentage
patientPrescriptionSchema.methods.calculateAdherence = function() {
  if (!this.adherenceLog || this.adherenceLog.length === 0) {
    return 0;
  }
  
  const totalLogs = this.adherenceLog.length;
  const takenCount = this.adherenceLog.filter(log => log.taken).length;
  
  return Math.round((takenCount / totalLogs) * 100);
};

// Static method to find active prescriptions for a patient
patientPrescriptionSchema.statics.findActiveForPatient = function(patientId) {
  const now = new Date();
  return this.find({
    patientId: new mongoose.Types.ObjectId(patientId),
    isActive: true,
    isDeleted: false,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
};

module.exports = mongoose.model(
  "Patient_Prescription",
  patientPrescriptionSchema,
  "Patient_Prescription"
);

