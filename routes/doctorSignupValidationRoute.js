// routes/doctorSignupValidationRoute.js
const express = require("express");
const { validateDoctorSignup } = require("../controller/doctorSignupValidationController");

const router = express.Router();

// POST /api/validateSignup
router.post("/validateSignup", validateDoctorSignup);

module.exports = router;

