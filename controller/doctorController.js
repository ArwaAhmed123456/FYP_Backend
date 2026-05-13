// controller/doctorController.js
const Doctor = require("../models/DoctorModel");
const PendingDoctor = require("../models/PendingDoctorModel");
const bcrypt = require("bcryptjs");
const { getOrCreateTranslation, invalidateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

// Doctor fields worth translating (free-text descriptions written by the doctor/admin)
const DOCTOR_TRANSLATABLE_FIELDS = ['about', 'education'];
const DOCTOR_ARRAY_TRANSLATABLE = ['specialization', 'medicalDegree', 'residency', 'fellowship', 'boardCertification'];

const addDoctor = async (req, res) => {
  try {
    const doctorData = req.body;
    doctorData.status = "pending";

    // Normalize email to lowercase for case-insensitive matching and storage
    if (doctorData.email) {
      doctorData.email = doctorData.email.toLowerCase();
    }

    const existing = await PendingDoctor.findOne({ email: doctorData.email });
    if (existing) return res.status(400).json({ message: "Doctor already pending approval" });

    const newPendingDoctor = new PendingDoctor(doctorData);
    await newPendingDoctor.save();

    res.status(201).json({
      message: "Doctor added successfully to Pending_Doctors",
      doctor: newPendingDoctor,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add doctor", error: error.message });
  }
};

const getAllDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find({ status: "approved" });
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching approved doctors", error: error.message });
  }
};

const getAllPendingDoctors = async (req, res) => {
  try {
    const pendingDoctors = await PendingDoctor.find({ status: "pending" });
    res.json(pendingDoctors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching pending doctors", error: error.message });
  }
};

const getDoctorById = async (req, res) => {
  try {
    const { identifier } = req.params;
    // Try to find by ID first, then by email (normalized to lowercase)
    const doctor =
      (await Doctor.findById(identifier)) || (await Doctor.findOne({ email: identifier.toLowerCase() }));

    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    // Optional: patient userId from query param for language lookup
    const patientUserId = req.query.userId || req.query.patientId || req.user?.userId;
    const lang = await getPatientLanguage(patientUserId);

    if (lang === 'ur') {
      const docObj = doctor.toObject ? doctor.toObject() : doctor;
      const fieldsToTranslate = {};

      for (const key of DOCTOR_TRANSLATABLE_FIELDS) {
        if (typeof docObj[key] === 'string' && docObj[key].trim().length > 0) {
          fieldsToTranslate[key] = docObj[key];
        }
      }
      // Join array fields into a single string for translation, then split back
      for (const key of DOCTOR_ARRAY_TRANSLATABLE) {
        if (Array.isArray(docObj[key]) && docObj[key].length > 0) {
          fieldsToTranslate[key] = docObj[key].join(', ');
        }
      }

      if (Object.keys(fieldsToTranslate).length > 0) {
        const translated = await getOrCreateTranslation('Doctor', doctor._id, fieldsToTranslate, lang);
        const result = { ...docObj };
        for (const key of DOCTOR_TRANSLATABLE_FIELDS) {
          if (translated[key] !== undefined) result[key] = translated[key];
        }
        for (const key of DOCTOR_ARRAY_TRANSLATABLE) {
          if (translated[key] !== undefined) {
            result[key] = translated[key].split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
        return res.json(result);
      }
    }

    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateDoctor = async (req, res) => {
  try {
    const { identifier } = req.params;
    const updateData = req.body;

    // Normalize email in updateData if present
    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase();
    }

    const updatedDoctor =
      (await Doctor.findByIdAndUpdate(identifier, updateData, { new: true })) ||
      (await Doctor.findOneAndUpdate({ email: identifier.toLowerCase() }, updateData, { new: true }));

    if (!updatedDoctor)
      return res.status(404).json({ message: "Doctor not found or not approved yet" });

    // Invalidate translation cache so next read re-translates with new data
    invalidateTranslation('Doctor', updatedDoctor._id).catch(() => {});

    res.json({ message: "Doctor updated successfully", doctor: updatedDoctor });
  } catch (error) {
    res.status(500).json({ message: "Error updating doctor", error: error.message });
  }
};

const approveDoctor = async (req, res) => {
  try {
    const { identifier } = req.params;

    const pendingDoctor =
      (await PendingDoctor.findById(identifier)) ||
      (await PendingDoctor.findOne({ email: identifier.toLowerCase() }));

    if (!pendingDoctor)
      return res.status(404).json({ message: "Pending doctor not found" });

    // Normalize email for comparison
    const normalizedEmail = pendingDoctor.email ? pendingDoctor.email.toLowerCase() : null;
    const existingApproved = await Doctor.findOne({ email: normalizedEmail });
    if (existingApproved)
      return res.status(400).json({ message: "Doctor already approved" });

    const approvedDoctorData = { ...pendingDoctor.toObject(), status: "approved" };
    delete approvedDoctorData._id;
    
    // Ensure email is normalized in approved doctor data
    if (approvedDoctorData.email) {
      approvedDoctorData.email = approvedDoctorData.email.toLowerCase();
    }

    const approvedDoctor = new Doctor(approvedDoctorData);
    await approvedDoctor.save();
    await PendingDoctor.deleteOne({ email: normalizedEmail });

    res.json({ message: "Doctor approved successfully", doctor: approvedDoctor });
  } catch (error) {
    res.status(500).json({ message: "Error approving doctor", error: error.message });
  }
};

const rejectDoctor = async (req, res) => {
  try {
    const { identifier } = req.params;

    const deletedDoctor =
      (await PendingDoctor.findByIdAndDelete(identifier)) ||
      (await PendingDoctor.findOneAndDelete({ email: identifier.toLowerCase() }));

    if (!deletedDoctor)
      return res.status(404).json({ message: "Pending doctor not found" });

    res.json({ message: "Doctor rejected and removed" });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting doctor", error: error.message });
  }
};

const deleteDoctor = async (req, res) => {
  try {
    const { identifier } = req.params;

    const deletedDoctor =
      (await Doctor.findByIdAndDelete(identifier)) ||
      (await Doctor.findOneAndDelete({ email: identifier.toLowerCase() }));

    if (!deletedDoctor)
      return res.status(404).json({ message: "Doctor not found" });

    res.json({ message: "Doctor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting doctor", error: error.message });
  }
};

const changeDoctorPassword = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { oldPassword, newPassword } = req.body;

    const doctor =
      (await Doctor.findById(identifier)) || (await Doctor.findOne({ email: identifier.toLowerCase() }));

    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const isMatch = await bcrypt.compare(oldPassword, doctor.password);
    if (!isMatch) return res.status(400).json({ message: "Old password is incorrect" });

    doctor.password = await bcrypt.hash(newPassword, 10);
    await doctor.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating password", error: error.message });
  }
};

module.exports = {
  addDoctor,
  getAllDoctors,
  getAllPendingDoctors,
  getDoctorById,
  updateDoctor,
  approveDoctor,
  rejectDoctor,
  deleteDoctor,
  changeDoctorPassword,
};

