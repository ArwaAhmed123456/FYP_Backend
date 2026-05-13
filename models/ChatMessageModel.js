/**
 * ChatMessage model - NEW collection only. Do not modify existing collections.
 * Mongoose model for chat_messages.
 */
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ChatSession',
      index: true,
    },
    sender: {
      type: String,
      enum: ['user', 'bot'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isVoice: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'chat_messages',
  }
);

chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);
