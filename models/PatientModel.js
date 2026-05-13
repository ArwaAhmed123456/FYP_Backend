// models/PatientModel.js
const mongoose = require("mongoose");

const patientSchema = mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    emailAddress: { type: String },
    phone: { type: String },
    gender: { type: String },
    Age: { type: Number },
    address: { type: Object },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
    lastVisit: { type: Date },
    nextAppointment: { type: Date },
    profileImage: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patient", patientSchema, "Patient");

