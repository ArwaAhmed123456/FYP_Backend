/**
 * ChatSession model - NEW collection only. Do not modify existing collections.
 * Mongoose model for chat_sessions.
 */
const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'New chat',
      trim: true,
    },
    language: {
      type: String,
      enum: ['en', 'ur'],
      default: 'en',
    },
  },
  {
    timestamps: true,
    collection: 'chat_sessions',
  }
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
