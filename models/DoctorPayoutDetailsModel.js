const mongoose = require('mongoose');

const doctorPayoutDetailsSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    accountHolderName: {
      type: String,
      default: '',
      trim: true,
    },
    bankName: {
      type: String,
      default: '',
      trim: true,
    },
    accountNumber: {
      type: String,
      default: '',
      trim: true,
    },
    iban: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['not-setup', 'verification-pending', 'active', 'temporarily-unavailable'],
      default: 'verification-pending',
      index: true,
    },
    stripeAccountId: {
      type: String,
      default: null,
    },
    feedback: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

doctorPayoutDetailsSchema.index({ doctorId: 1, status: 1 });

module.exports = mongoose.model('DoctorPayoutDetails', doctorPayoutDetailsSchema, 'DoctorPayoutDetails');

