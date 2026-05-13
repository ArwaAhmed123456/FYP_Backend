// models/DoctorPatientMappingModel.js
const mongoose = require("mongoose");

const doctorPatientMappingSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true
    },
    // The last date until which the doctor can view this patient's details
    // If null, patient is fully visible (no restriction)
    // If set, doctor can only view patient until this date (inclusive)
    lastVisibleDate: {
      type: Date,
      default: null,
      index: true
    },
    // Flag to indicate if the patient has been removed from doctor's view
    // If true, patient should not appear in doctor's patient list at all
    isRemoved: {
      type: Boolean,
      default: false,
      index: true
    },
    // Audit trail: track when visibility was last updated and why
    lastUpdatedBy: {
      type: String, // 'system' | 'cancellation' | 'rebook' | 'migration'
      default: 'system'
    },
    lastUpdatedReason: {
      type: String,
      default: null
    },
    // Access logging: Array of access entries (append-only for compliance)
    accessLog: [{
      timestamp: { type: Date, required: true, default: Date.now },
      purpose: { 
        type: String, 
        required: true,
        enum: ['view_profile', 'view_timeline', 'update_notes', 'issue_prescription', 'view_medical_record', 'other']
      },
      metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
    }]
  },
  { 
    timestamps: true,
    // Compound index for efficient queries
    // This ensures we can quickly find mappings by doctor+patient
  }
);

// Compound index for efficient lookups
doctorPatientMappingSchema.index({ doctorId: 1, patientId: 1 }, { unique: true });

// Index for patient list queries (doctor + visibility filter)
doctorPatientMappingSchema.index({ doctorId: 1, isRemoved: 1, lastVisibleDate: 1 });

module.exports = mongoose.model(
  "DoctorPatientMapping",
  doctorPatientMappingSchema,
  "DoctorPatientMapping"
);

