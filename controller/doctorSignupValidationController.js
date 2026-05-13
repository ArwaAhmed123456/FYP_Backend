// controller/doctorSignupValidationController.js
const Doctor = require("../models/DoctorModel");
const PendingDoctor = require("../models/PendingDoctorModel");

const validateDoctorSignup = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = email.toLowerCase();

    const existingDoctor = await Doctor.findOne({ email: normalizedEmail });
    if (existingDoctor)
      return res
        .status(400)
        .json({ message: "This email is already registered as a doctor." });

    const existingPending = await PendingDoctor.findOne({ email: normalizedEmail });
    if (existingPending)
      return res
        .status(400)
        .json({ message: "This email is already awaiting approval." });

    return res.status(200).json({ message: "Email is available" });
  } catch (error) {
    console.error("Signup validation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { validateDoctorSignup };

