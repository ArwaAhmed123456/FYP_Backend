// models/DoctorScheduleLogModel.js
const mongoose = require("mongoose");

const doctorScheduleLogSchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    totalSlots: {
      type: Number,
      required: true,
    },
    bookedSlots: {
      type: Number,
      required: true,
    },
    patientIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Index for efficient queries
doctorScheduleLogSchema.index({ doctorId: 1, date: 1 });

module.exports = mongoose.model(
  "DoctorScheduleLog",
  doctorScheduleLogSchema,
  "Doctor_ScheduleLog"
);

