// models/DoctorAvailabilityModel.js
const mongoose = require("mongoose");

const doctorAvailabilitySchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    timeSlots: {
      type: [{
        time: String, // e.g., "09:00 AM"
        status: {
          type: String,
          enum: ["available", "booked"],
          default: "available"
        },
        appointmentId: {
          type: String,
          default: null
        }
      }],
      default: []
    },
    totalSlots: {
      type: String,
      required: true,
    },
    bookedSlots: {
      type: String,
      default: "0",
    },
    availableSlots: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
doctorAvailabilitySchema.index({ doctorId: 1, date: 1 });

module.exports = mongoose.model(
  "DoctorAvailability",
  doctorAvailabilitySchema,
  "Doctor_Availability"
);

