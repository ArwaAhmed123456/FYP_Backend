// models/DoctorAppointmentActivityModel.js
const mongoose = require("mongoose");

const doctorAppointmentActivitySchema = new mongoose.Schema(
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
      type: String,
      required: true,
    },
    bookedSlots: {
      type: String,
      required: true,
    },
    availableSlots: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["expired", "deleted", "updated", "rescheduled", "booked"],
      default: "expired",
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "DoctorAppointmentActivity",
  doctorAppointmentActivitySchema,
  "Doctor_AppointmentActivity"
);

