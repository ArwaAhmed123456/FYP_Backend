// routes/prescriptionRoutes.js
const express = require("express");
const {
  createPrescription,
  getPatientPrescriptions,
  getPrescriptionById,
  updatePrescription,
  deletePrescription,
  logAdherence,
  getPrescriptionHistory,
  signPrescription,
  requestPrescriptionOTP,
  verifyPrescriptionOTP
} = require("../controller/prescriptionController");

const {
  createEPrescription,
  signEPrescription,
  getPatientEPrescriptions,
  getEPrescriptionById,
  deleteEPrescription
} = require("../controller/ePrescriptionController");

const router = express.Router();
const { 
  markReminderAsTaken, 
  markReminderAsSkipped, 
  getUpcomingReminders 
} = require("../services/prescriptionReminderService");

// Regular prescription routes
router.post("/", createPrescription);
router.get("/patient/:patientId", (req, res, next) => {
  console.log(`🔵 [ROUTE] GET /patient/:patientId - Request received at ${new Date().toISOString()}`);
  console.log(`🔵 [ROUTE] Params:`, req.params);
  console.log(`🔵 [ROUTE] Query:`, req.query);
  console.log(`🔵 [ROUTE] Headers:`, req.headers);
  next();
}, getPatientPrescriptions);
router.get("/patient/:patientId/history", getPrescriptionHistory);
router.get("/:id", getPrescriptionById);
router.put("/:id", updatePrescription);
router.delete("/:id", deletePrescription);
router.post("/:id/adherence", logAdherence);
router.post("/:id/request-otp", requestPrescriptionOTP);
router.post("/:id/verify-otp", verifyPrescriptionOTP);
router.post("/:id/sign", signPrescription);

// Reminder routes
router.post("/:id/reminders/taken", async (req, res) => {
  try {
    const { id } = req.params;
    const { reminderTime, patientId } = req.body;
    const result = await markReminderAsTaken(id, reminderTime, patientId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/reminders/skipped", async (req, res) => {
  try {
    const { id } = req.params;
    const { reminderTime, patientId } = req.body;
    const result = await markReminderAsSkipped(id, reminderTime, patientId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/patient/:patientId/upcoming-reminders", async (req, res) => {
  try {
    const { patientId } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    const reminders = await getUpcomingReminders(patientId, limit);
    res.json({ success: true, reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// E-prescription routes
router.post("/e-prescriptions", createEPrescription);
router.post("/e-prescriptions/:id/sign", signEPrescription);
router.get("/e-prescriptions/patient/:patientId", (req, res, next) => {
  console.log(`🔵 [ROUTE] GET /e-prescriptions/patient/:patientId - Request received at ${new Date().toISOString()}`);
  console.log(`🔵 [ROUTE] Params:`, req.params);
  console.log(`🔵 [ROUTE] Query:`, req.query);
  console.log(`🔵 [ROUTE] Headers:`, req.headers);
  next();
}, getPatientEPrescriptions);
router.get("/e-prescriptions/:id", getEPrescriptionById);
router.delete("/e-prescriptions/:id", deleteEPrescription);

module.exports = router;

