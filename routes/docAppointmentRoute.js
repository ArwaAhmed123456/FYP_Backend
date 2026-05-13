// routes/docAppointmentRoute.js
const express = require("express");
const authenticateDoctor = require("../middleware/authenticateDoctor");
const {
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByDoctor,
  getAppointmentsByPatient,
  getPast30DaysAppointments,
  createAppointment,
  updateAppointmentStatus,
  confirmRescheduledAppointment,
  cancelRescheduledAppointment,
  deleteAppointment,
  deleteAllCompletedAppointments
} = require("../controller/docAppointmentController");

const router = express.Router();

// Apply doctor auth to all routes in this file
router.use(authenticateDoctor);

// Get all appointments
router.get("/all", getAllAppointments);

// Prevent missing doctorId
router.get("/doctor", (req, res) => {
  return res.status(400).json({
    success: false,
    message: "❌ Doctor ID is required in the URL. Example: /api/appointments/doctor/<doctorId>"
  });
});

// Get appointments by doctor ID
router.get("/doctor/:doctorId", getAppointmentsByDoctor);

// Prevent missing patientId
router.get("/patient", (req, res) => {
  return res.status(400).json({
    success: false,
    message: "❌ Patient ID is required in the URL. Example: /api/appointments/patient/<patientId>"
  });
});

// Get appointments by patient ID
router.get("/patient/:patientId", getAppointmentsByPatient);

// Get past 30 days appointments for a doctor
router.get("/doctor/:doctorId/past-30-days", getPast30DaysAppointments);

// Get single appointment by appointment ID
router.get("/:id", getAppointmentById);

// Create a new appointment
router.post("/", createAppointment);

// Update an existing appointment
router.put("/:id", updateAppointmentStatus);

// Patient confirms rescheduled appointment
router.post("/:id/confirm-reschedule", confirmRescheduledAppointment);

// Patient cancels rescheduled appointment
router.post("/:id/cancel-reschedule", cancelRescheduledAppointment);

// Delete an appointment
router.delete("/:id", deleteAppointment);

// Delete all completed appointments (optionally for a specific doctor)
router.delete("/completed/all", deleteAllCompletedAppointments);
router.delete("/completed/doctor/:doctorId", deleteAllCompletedAppointments);

module.exports = router;

