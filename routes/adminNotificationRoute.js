// routes/adminNotificationRoute.js
const express = require("express");
const { createAdminNotification } = require("../controller/AdminNotificationController");

const router = express.Router();

// POST: /api/adminNotifications
router.post("/", createAdminNotification);

module.exports = router;

