// routes/doctorRoutes.js
const express = require("express");
const {
  getAllDoctors,
  addDoctor,
  getDoctorById,
  updateDoctor,
  approveDoctor,
  rejectDoctor,
  deleteDoctor,
  getAllPendingDoctors,
  changeDoctorPassword,
} = require("../controller/doctorController");

const router = express.Router();

router.post("/", addDoctor);
router.get("/", getAllDoctors);
router.get("/pending/list", getAllPendingDoctors);
router.get("/:identifier", getDoctorById);
router.put("/:identifier", updateDoctor);
router.put("/:identifier/approve", approveDoctor);
router.put("/:identifier/reject", rejectDoctor);
router.put("/:identifier/change-password", changeDoctorPassword);
router.delete("/:identifier", deleteDoctor);

module.exports = router;

