/**
 * OCR-originated health records. Does not modify existing Patient Medical Record schema.
 * Stores: userId, imageUrl (HTTPS only), ocrText, parsed tags, createdAt.
 */
const mongoose = require('mongoose');

const healthRecordOcrSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    ocrText: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'processed',
    },
    sourceFileName: {
      type: String,
      default: '',
    },
    linkedRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientMedicalRecord',
      default: null,
    },
    language: {
      type: String,
      enum: ['english', 'urdu'],
      default: 'english',
    },
    readabilityScore: {
      type: Number,
      default: null,
    },
    simplifiedText: {
      type: String,
      default: '',
    },
    wasSimplified: {
      type: Boolean,
      default: false,
    },
    parsed: {
      diagnoses: [{ type: String, trim: true }],
      prescriptions: [{ type: String, trim: true }],
      allergies: [{ type: String, trim: true }],
    },
  },
  { timestamps: true }
);

healthRecordOcrSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.HealthRecordOcr ||
  mongoose.model('HealthRecordOcr', healthRecordOcrSchema, 'HealthRecordOCR');
