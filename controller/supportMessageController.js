// controller/supportMessageController.js
const SupportRequest = require("../models/SupportRequestModel");
const SupportMessage = require("../models/SupportMessageModel");
const Patient = require("../models/PatientModel");

/**
 * Get all messages for a support request (chat thread).
 * Patient: can only access their own request. Admin: can access any.
 */
const getMessages = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const authUser = req.user || {};
    const authUserId = authUser.userId || authUser._id || authUser.id;
    const authRole = (authUser.userRole || authUser.role || "").toLowerCase();

    const request = await SupportRequest.findById(requestId).lean();
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    // Patient/doctor can only see their own request when we know who they are.
    // Mobile apps often call this without a JWT (best-effort auth), so we only
    // enforce the ownership check when we actually have an authenticated user.
    if (authUserId) {
      if (request.userType === "patient" && request.patientId) {
        if (authRole !== "admin" && String(request.patientId) !== String(authUserId)) {
          return res.status(403).json({
            success: false,
            message: "Not authorized to view this conversation",
          });
        }
      }
      if (request.userType === "doctor" && request.doctorId) {
        if (authRole !== "admin" && String(request.doctorId) !== String(authUserId)) {
          return res.status(403).json({
            success: false,
            message: "Not authorized to view this conversation",
          });
        }
      }
    }

    const messages = await SupportMessage.find({ supportRequestId: requestId })
      .sort({ createdAt: 1 })
      .select("-__v")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Messages retrieved successfully",
      messages,
      supportRequest: {
        _id: request._id,
        subject: request.subject,
        status: request.status,
        userType: request.userType,
      },
    });
  } catch (error) {
    console.error("Error fetching support messages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

/**
 * Send a message in a support request thread.
 * Body: { text } (senderType inferred: patient if request.patientId === auth, else admin)
 */
const sendMessage = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { text } = req.body;
    const authUser = req.user || {};
    const authUserId = authUser.userId || authUser._id || authUser.id;
    const authRole = (authUser.userRole || authUser.role || "").toLowerCase();

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        success: false,
        message: "Message text is required",
      });
    }

    const request = await SupportRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    let senderType;
    if (authRole === "admin") {
      senderType = "admin";
    } else if (authUserId && request.patientId && String(request.patientId) === String(authUserId)) {
      senderType = "patient";
    } else if (authUserId && request.doctorId && String(request.doctorId) === String(authUserId)) {
      senderType = "doctor";
    } else if (!authUserId && !authRole) {
      // No authenticated user (mobile app without JWT) – fall back to the request's userType.
      // This assumes the caller is the owner-side (patient or doctor) of this conversation.
      senderType = request.userType; // "patient" or "doctor"
    } else {
      return res.status(403).json({
        success: false,
        message: "Not authorized to send messages in this conversation",
      });
    }

    // Normalize for schema (we only have patient | admin in SupportMessage).
    // For doctor-originated messages we treat the doctor as the "patient" side so that
    // both patient and doctor apps can render the local user consistently.
    const messageSenderType = senderType === "doctor" ? "patient" : senderType;

    const msg = await SupportMessage.create({
      supportRequestId: requestId,
      senderType: messageSenderType,
      senderId: authUserId,
      text: String(text).trim(),
    });

    // When admin replies, mark ticket as in-progress if it was open
    if (messageSenderType === "admin") {
      if (request.status === "open") {
        request.status = "in-progress";
      }
      // Track last admin reply time for unread indicator
      request.lastAdminMessageAt = new Date();
      await request.save();
    }

    return res.status(201).json({
      success: true,
      message: "Message sent",
      supportMessage: {
        _id: msg._id,
        supportRequestId: msg.supportRequestId,
        senderType: msg.senderType,
        text: msg.text,
        createdAt: msg.createdAt,
      },
    });
  } catch (error) {
    console.error("Error sending support message:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

module.exports = {
  getMessages,
  sendMessage,
};
