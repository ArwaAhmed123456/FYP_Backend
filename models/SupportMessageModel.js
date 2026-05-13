// models/SupportMessageModel.js
// Collection: SupportMessages - used for conversing with patients (chat thread per ticket)
const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    supportRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportRequest",
      required: true,
      index: true,
    },
    senderType: {
      type: String,
      enum: ["patient", "admin"],
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // optional for system messages
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

supportMessageSchema.index({ supportRequestId: 1, createdAt: 1 });

module.exports = mongoose.model(
  "SupportMessage",
  supportMessageSchema,
  "SupportMessages"
);
