// models/PatientAppointmentActivityModel.js
const mongoose = require("mongoose");

const patientAppointmentActivitySchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
    },
    appointmentId: {
      type: String,
      required: true,
    },
    doctorId: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["booked", "rescheduled", "deleted"],
      required: true,
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    appointmentTime: {
      type: String,
    },
    consultationType: {
      type: String,
    },
    previousDate: {
      type: Date, // For reschedule action - stores the old date
    },
    previousTime: {
      type: String, // For reschedule action - stores the old time
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PatientAppointmentActivity",
  patientAppointmentActivitySchema,
  "Patient_AppointmentActivity"
);

