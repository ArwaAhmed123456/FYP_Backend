// routes/PatientDetailRoute.js
const express = require("express");
const {
  getPatients,
  getPatientById,
  getPatientWithMedicalRecord,
  getPatientTimeline,
  getDiagnosticInfo,
  getPatientHealthRecords,
} = require("../controller/PatientDetailController");
const authenticateDoctor = require("../middleware/authenticateDoctor");

const router = express.Router();

// Apply doctor auth to all routes in this file
router.use(authenticateDoctor);

// General patient routes
router.get("/", getPatients);
router.get("/:id", getPatientById);

// New route: fetch patient + medical record
router.get("/full/:id", getPatientWithMedicalRecord);

// Timeline route: fetch patient activity timeline
router.get("/:id/timeline", getPatientTimeline);

// OCR health records for a patient (doctor view — visibility-gated)
router.get("/:patientId/health-records", getPatientHealthRecords);

// Diagnostic route: debug visibility and access logs (for developers)
router.get("/diagnostic/info", getDiagnosticInfo);

module.exports = router;

