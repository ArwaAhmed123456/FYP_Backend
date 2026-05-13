/**
 * MedicalDictionaryEntry model - NEW collection only. Do not modify existing collections.
 * Mongoose model for medical_dictionary_entries.
 */
const mongoose = require('mongoose');

const medicalDictionaryEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ChatSession',
      index: true,
    },
    term: {
      type: String,
      required: true,
      trim: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      enum: ['en', 'ur'],
      default: 'en',
    },
  },
  {
    timestamps: true,
    collection: 'medical_dictionary_entries',
  }
);

medicalDictionaryEntrySchema.index({ sessionId: 1, term: 1 }, { unique: true });

module.exports =
  mongoose.models.MedicalDictionaryEntry ||
  mongoose.model('MedicalDictionaryEntry', medicalDictionaryEntrySchema);
