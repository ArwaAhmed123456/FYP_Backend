const mongoose = require("mongoose");

// Mirror of admin PaymentPlan schema for cross-app compatibility.
// Collection name MUST remain "PaymentPlan" so the doc-patient-panel admin
// can see and manage these plans.
const paymentPlanSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    consultationType: {
      type: String,
      required: true,
      enum: ["In-person", "Video Call", "Phone Call"],
      default: "In-person",
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
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "revision_requested", "disabled"],
      default: "pending",
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    previousPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionFeedback: {
      type: String,
      default: "",
    },
    revisionFeedback: {
      type: String,
      default: "",
    },
    disabledBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    disabledAt: {
      type: Date,
      default: null,
    },
    disabledReason: {
      type: String,
      default: "",
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "revision_requested", "disabled"],
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
        },
        changedByName: {
          type: String,
        },
        changedByRole: {
          type: String,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        feedback: {
          type: String,
          default: "",
        },
        isOverride: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  { timestamps: true }
);

paymentPlanSchema.index({ doctorId: 1, status: 1 });
paymentPlanSchema.index({ status: 1, submittedAt: -1 });

module.exports = mongoose.model("PaymentPlan", paymentPlanSchema, "PaymentPlan");

