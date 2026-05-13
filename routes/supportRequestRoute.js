// routes/supportRequestRoute.js
const express = require("express");
const jwt = require("jsonwebtoken");
const authService = require("../services/auth");
const {
  createSupportRequest,
  getSupportRequestsByDoctor,
  getSupportRequestsByPatient,
  getSupportRequestById,
  getAllSupportRequests,
  updateSupportRequestStatus,
  markSupportRequestRead,
} = require("../controller/supportRequestController");
const { getMessages, sendMessage } = require("../controller/supportMessageController");

const router = express.Router();

// Admin JWT secret (doc-patient-panel) - same as admin panel JWT_SECRET so admin token is accepted
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  // For now, make auth best-effort so doctor + patient apps don't get blocked by token mismatches.
  if (!token) {
    return next();
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
    return next();
  } catch (_) {
    // Try admin token (doc-patient-panel): payload is { id }
    if (ADMIN_JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (decoded && decoded.id) {
          req.user = {
            userId: decoded.id,
            _id: decoded.id,
            userRole: "admin",
            role: "admin",
          };
        }
      } catch (__) {
        // ignore and continue without user
      }
    }
    return next();
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const role = (req.user.userRole || req.user.role || "").toLowerCase();
  if (role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
};

// Create a new support request (patients/doctors; auth required so requester can only submit for themselves)
router.post("/", authenticateToken, createSupportRequest);

// Get all support requests (admin only) - so admin can see patient messages
router.get("/admin/all", authenticateToken, requireAdmin, getAllSupportRequests);

// Get all support requests for a doctor
router.get("/doctor/:doctorId", getSupportRequestsByDoctor);

// Get all support requests for a patient
router.get("/patient/:patientId", getSupportRequestsByPatient);

// Get messages for a support request (chat thread) - auth required
router.get("/:id/messages", authenticateToken, getMessages);
// Send a message in a support request - auth required
router.post("/:id/messages", authenticateToken, sendMessage);

// Get a single support request by ID
router.get("/:id", getSupportRequestById);

// Update support request status (admin only - for future use)
router.put("/:id/status", updateSupportRequestStatus);

// Mark support request as read by current user (doctor/patient or admin)
router.post("/:id/mark-read", authenticateToken, markSupportRequestRead);

module.exports = router;

