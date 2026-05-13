const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, required: true }, // e.g. 'pdf' | 'doc' | 'docx'
  },
  { _id: false }
);

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },

    // Author + source
    authorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    authorRole: {
      type: String,
      enum: ['doctor', 'api'],
      required: true,
      default: 'doctor',
      index: true,
    },
    source: {
      type: String,
      enum: ['doctor', 'api'],
      required: true,
      default: 'doctor',
      index: true,
    },
    sourceName: { type: String, default: '', index: true }, // e.g. 'Patient.info', 'WHO', 'Pakistan Health Guide'

    // Content metadata
    genre: { type: String, default: '', index: true },
    language: {
      type: String,
      enum: ['en', 'ur'],
      default: 'en',
      index: true,
    },
    attachments: [AttachmentSchema],

    // Engagement
    views: { type: Number, default: 0, index: true },
    rating: { type: Number, default: 0 }, // average rating 0-5
    ratingCount: { type: Number, default: 0 }, // internal helper for average

    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
      index: true,
    },
    embedding: { type: [Number], default: undefined },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', default: null },
    duplicateWarning: { type: String, default: null },
    genreConfidence: { type: Number, default: null },
    credibilityScore: { type: Number, default: null, index: true },
    credibilityBreakdown: {
      sourceTrust: { type: Number },
      contentSignals: { type: Number },
      authorAuthority: { type: Number },
      engagement: { type: Number },
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

// Helpful compound indexes for analytics
BlogSchema.index({ genre: 1, status: 1 });
BlogSchema.index({ source: 1, status: 1 });
BlogSchema.index({ authorId: 1, status: 1 });
BlogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Blog', BlogSchema, 'Blog');

