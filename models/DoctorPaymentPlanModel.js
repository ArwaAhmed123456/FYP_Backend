const mongoose = require('mongoose');

const doctorPaymentPlanSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    consultationType: {
      type: String,
      enum: ['video', 'in-person'],
      required: true,
      default: 'video',
    },
    duration: {
      type: Number, // minutes
      required: true,
      min: 15,
      max: 180,
    },
    fee: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'under-review', 'active', 'disabled'],
      default: 'draft',
      index: true,
    },
    feedback: {
      type: String,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    disabledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

doctorPaymentPlanSchema.index({ doctorId: 1, status: 1 });

module.exports = mongoose.model('DoctorPaymentPlan', doctorPaymentPlanSchema, 'DoctorPaymentPlans');

