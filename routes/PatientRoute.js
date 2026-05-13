// routes/PatientRoute.js
const express = require("express");
const { getPatients, getPatientById } = require("../controller/PatientController");

const router = express.Router();

router.get("/", getPatients);
router.get("/:id", getPatientById);

module.exports = router;

