// routes/doctorAvailabilityRoute.js
const express = require("express");
const {
  createOrUpdateAvailability,
  getAvailabilityByDoctorAndDate,
  getAvailabilityByDoctor,
  bookTimeSlot,
  deleteTimeSlot,
  deleteAvailabilityByDate,
  deleteExpiredAvailability
} = require("../controller/doctorAvailabilityController");

const router = express.Router();

// Create or update availability
router.post("/", createOrUpdateAvailability);

// Get availability by doctor ID and date
router.get("/doctor/:doctorId/date/:date", getAvailabilityByDoctorAndDate);

// Get all availability for a doctor
router.get("/doctor/:doctorId", getAvailabilityByDoctor);

// Book a time slot
router.post("/book", bookTimeSlot);

// Delete a time slot
router.post("/delete-slot", deleteTimeSlot);

// Delete entire availability for a date
router.delete("/", deleteAvailabilityByDate);

// Delete expired availability (for cron job)
router.delete("/expired", async (req, res) => {
  try {
    const result = await deleteExpiredAvailability();
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deleted} expired entries`,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting expired availability",
      error: error.message
    });
  }
});

module.exports = router;

