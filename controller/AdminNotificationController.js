// controller/AdminNotificationController.js
const AdminNotificationModel = require("../models/AdminNotificationModel");
const Doctor = require("../models/DoctorModel");

const createAdminNotification = async (req, res) => {
  try {
    const { doctorId, message } = req.body;

    if (!doctorId || !message) {
      return res.status(400).json({ message: "Doctor ID and message are required" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const requestedAt = new Date();
    const deadline = new Date(requestedAt);
    deadline.setDate(deadline.getDate() + 7);

    const notificationData = {
      title: "Account Deletion Request",
      message,
      type: "error",
      category: "account_management",
      priority: "high",
      recipients: "admin",
      relatedEntity: doctor._id.toString(),
      relatedEntityType: "Doctor",
      metadata: {
        requestType: "deletion",
        doctorName: doctor.DoctorName,
        doctorEmail: doctor.email,
        action: "doctor_account_deletion_request",
        requestedAt,
        deadline,
      },
    };

    const result = await AdminNotificationModel.createNotification(notificationData);

    return res.status(201).json({
      message: "Notification created successfully",
      notification: result,
    });
  } catch (err) {
    console.error("AdminNotification Error:", err);
    return res.status(500).json({ message: "Failed to create notification" });
  }
};

module.exports = { createAdminNotification };

