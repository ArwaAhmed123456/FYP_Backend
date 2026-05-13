// models/PendingDoctorModel.js
const mongoose = require("mongoose");

const PendingdoctorSchema = new mongoose.Schema(
  {
    DoctorName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, default: "Doctor@123" },
    specialization: [{ type: String }],
    experience: String,
    phone: { type: String },
    department: String,
    about: String,
    medicalDegree: [{ type: String }],
    residency: [{ type: String }],
    fellowship: [{ type: String }],
    boardCertification: [{ type: String }],
    licenses: [{ type: String }],
    deaRegistration: String,
    hospitalAffiliations: [{ type: String }],
    memberships: [{ type: String }],
    malpracticeInsurance: String,
    address: String,
    education: String,
    profileImage: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pending_Doctors", PendingdoctorSchema, "Pending_Doctors");

