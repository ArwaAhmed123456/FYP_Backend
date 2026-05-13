/**
 * Translation cache. One document per (sourceCollection, sourceId, targetLanguage) triple.
 * All translation logic lives in translationService.js — this is the persistence layer only.
 */
const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema(
  {
    sourceCollection: { type: String, required: true },
    sourceId:         { type: mongoose.Schema.Types.ObjectId, required: true },
    targetLanguage:   { type: String, enum: ['en', 'ur'], required: true },
    // Map<fieldName, translatedText>
    fields:           { type: Map, of: String, required: true },
  },
  {
    timestamps: true,
    collection: 'translations',
  }
);

// Exactly one translation document per source doc per language.
translationSchema.index(
  { sourceCollection: 1, sourceId: 1, targetLanguage: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.Translation ||
  mongoose.model('Translation', translationSchema);
