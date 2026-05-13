// models/EPrescriptionModel.js
const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dosage: { type: String, required: true, trim: true },
  frequency: { type: String, required: true, trim: true },
  instructions: { type: String, default: "" }
}, { _id: false });

const ePrescriptionSchema = new mongoose.Schema(
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
    medications: [medicationSchema],
    diagnosis: {
      type: String,
      default: ""
    },
    notes: {
      type: String,
      default: ""
    },
    pdfUrl: {
      type: String,
      default: null
    },
    signedByDoctor: {
      type: Boolean,
      default: false,
      index: true
    },
    signedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
ePrescriptionSchema.index({ patientId: 1, isDeleted: 1, createdAt: -1 }); // Optimized for patient view with sorting
ePrescriptionSchema.index({ doctorId: 1, isDeleted: 1 });
ePrescriptionSchema.index({ appointmentId: 1 });
ePrescriptionSchema.index({ createdAt: -1 });
ePrescriptionSchema.index({ signedByDoctor: 1, isDeleted: 1 });

module.exports = mongoose.model(
  "E_Prescription",
  ePrescriptionSchema,
  "E_Prescription"
);

