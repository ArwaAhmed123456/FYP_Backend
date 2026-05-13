const mongoose = require('mongoose');

const doctorPayoutSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    stripeTransferId: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true, // in dollars
    },
    currency: {
      type: String,
      default: 'usd',
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'canceled'],
      default: 'pending',
      index: true,
    },
    period: {
      type: String, // e.g. "2026-04"
      default: null,
    },
    transactionCount: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: '',
    },
    processedBy: {
      type: String, // admin userId
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

doctorPayoutSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('DoctorPayout', doctorPayoutSchema, 'DoctorPayouts');
