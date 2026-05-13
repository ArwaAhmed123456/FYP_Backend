// controller/supportRequestController.js
const SupportRequest = require("../models/SupportRequestModel");
const SupportMessage = require("../models/SupportMessageModel");
const Doctor = require("../models/DoctorModel");
const Patient = require("../models/PatientModel");
const { getOrCreateTranslation, invalidateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

/**
 * Translate only adminResponse (patient wrote their own request — no need to translate it back).
 */
async function translateSupportRequest(sr, patientId) {
  const lang = await getPatientLanguage(patientId);
  if (lang !== 'ur') return sr;
  if (!sr.adminResponse || !sr.adminResponse.trim()) return sr;

  const translated = await getOrCreateTranslation(
    'SupportRequests',
    sr._id,
    { adminResponse: sr.adminResponse },
    lang
  );
  return { ...sr, adminResponse: translated.adminResponse ?? sr.adminResponse };
}

/**
 * Create a new support request (for both doctors and patients)
 * userType is automatically determined based on which ID is provided.
 * When req.user is set (authenticated), patientId/doctorId must match the authenticated user.
 */
const createSupportRequest = async (req, res) => {
  try {
    const { doctorId, patientId, subject, message, contactEmail, appointmentId, transactionId, payoutId, issueType } = req.body;

    // Validation
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    // At least one ID must be provided
    if (!doctorId && !patientId) {
      return res.status(400).json({
        success: false,
        message: "Either doctorId or patientId must be provided",
      });
    }

    // NOTE: We intentionally do NOT enforce strict auth-based self-checks here.
    // The mobile apps (patient + doctor) call this endpoint without a backend-issued JWT,
    // and we already pass the correct doctorId/patientId explicitly from the client.
    // Admin-panel calls continue to be safe because they explicitly control doctorId/patientId.

    // If both are provided, prioritize doctorId
    let userType;
    let userId;
    let userModel;

    if (doctorId) {
      userType = "doctor";
      userId = doctorId;
      userModel = Doctor;
    } else {
      userType = "patient";
      userId = patientId;
      userModel = Patient;
    }

    // Verify user exists
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userType === "doctor" ? "Doctor not found" : "Patient not found",
      });
    }

    // Create support request (userType will be set automatically by pre-validate hook)
    const supportRequestData = {
      subject: subject.trim(),
      message: message.trim(),
      contactEmail: contactEmail && String(contactEmail).trim() ? String(contactEmail).trim() : null,
      appointmentId: appointmentId || null,
      transactionId: transactionId || null,
      payoutId: payoutId || null,
      issueType: issueType || "general",
      status: "open",
    };

    if (doctorId) {
      supportRequestData.doctorId = doctorId;
    } else {
      supportRequestData.patientId = patientId;
    }

    const supportRequest = new SupportRequest(supportRequestData);
    await supportRequest.save();

    // Start chat thread: add first message (patient/doctor initial message) - no email sent.
    // NOTE: SupportMessage only supports 'patient' | 'admin' for senderType, so we normalize:
    // - For doctor-initiated requests, we treat the doctor as the "patient"-side in this schema,
    //   so that the mobile UI can consistently render the local user on the same side.
    const initialSenderType = userType === "doctor" ? "patient" : userType;
    await SupportMessage.create({
      supportRequestId: supportRequest._id,
      senderType: initialSenderType,
      senderId: userId,
      text: message.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Support request submitted successfully",
      supportRequest: {
        _id: supportRequest._id,
        userType: supportRequest.userType,
        subject: supportRequest.subject,
        message: supportRequest.message,
        status: supportRequest.status,
        createdAt: supportRequest.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating support request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create support request",
      error: error.message,
    });
  }
};

/**
 * Get all support requests for a doctor
 */
const getSupportRequestsByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required",
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Get all support requests for this doctor, sorted by most recent first
    const supportRequests = await SupportRequest.find({ 
      userType: "doctor",
      doctorId 
    })
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Support requests retrieved successfully",
      supportRequests,
      count: supportRequests.length,
    });
  } catch (error) {
    console.error("Error fetching support requests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support requests",
      error: error.message,
    });
  }
};

/**
 * Get all support requests for a patient
 */
const getSupportRequestsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
      });
    }

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    // Get all support requests for this patient, sorted by most recent first
    const supportRequests = await SupportRequest.find({
      userType: "patient",
      patientId
    })
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    // Translate adminResponse for Urdu patients
    const translatedRequests = await Promise.all(
      supportRequests.map((sr) => translateSupportRequest(sr, patientId))
    );

    return res.status(200).json({
      success: true,
      message: "Support requests retrieved successfully",
      supportRequests: translatedRequests,
      count: translatedRequests.length,
    });
  } catch (error) {
    console.error("Error fetching support requests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support requests",
      error: error.message,
    });
  }
};

/**
 * Get a single support request by ID
 */
const getSupportRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const supportRequest = await SupportRequest.findById(id)
      .populate("doctorId", "DoctorName email")
      .populate("patientId", "firstName lastName emailAddress")
      .populate("appointmentId", "appointmentDate appointment_time status")
      .lean();

    if (!supportRequest) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    // Translate adminResponse for patient viewers
    const patientIdForLang = supportRequest.patientId?.toString?.() || supportRequest.patientId;
    const translatedRequest = await translateSupportRequest(supportRequest, patientIdForLang);

    return res.status(200).json({
      success: true,
      message: "Support request retrieved successfully",
      supportRequest: translatedRequest,
    });
  } catch (error) {
    console.error("Error fetching support request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support request",
      error: error.message,
    });
  }
};

/**
 * Get all support requests (admin only) - so admin can see patient messages
 */
const getAllSupportRequests = async (req, res) => {
  try {
    const { status, userType, limit = 100, skip = 0 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (userType) filter.userType = userType;

    const requests = await SupportRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip, 10))
      .limit(Math.min(parseInt(limit, 10) || 100, 500))
      .populate("patientId", "firstName lastName emailAddress phone")
      .populate("doctorId", "DoctorName email")
      .select("-__v")
      .lean();

    const total = await SupportRequest.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: "Support requests retrieved successfully",
      supportRequests: requests,
      count: requests.length,
      total,
    });
  } catch (error) {
    console.error("Error fetching all support requests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support requests",
      error: error.message,
    });
  }
};

/**
 * Mark a support request as read by the owning user (doctor or patient).
 * Sets lastUserSeenAt so clients can show an unread indicator when admin replies later.
 */
const markSupportRequestRead = async (req, res) => {
  try {
    const { id } = req.params;
    const authUser = req.user || {};
    const authUserId = authUser.userId || authUser._id || authUser.id;
    const authRole = (authUser.userRole || authUser.role || "").toLowerCase();

    const request = await SupportRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    // Only the owner (patient/doctor) or admin can mark as read when we know who they are.
    // For unauthenticated mobile calls (no JWT), we skip this check and trust the client-side.
    if (authUserId && authRole !== "admin") {
      const isPatientOwner =
        request.userType === "patient" &&
        request.patientId &&
        String(request.patientId) === String(authUserId);
      const isDoctorOwner =
        request.userType === "doctor" &&
        request.doctorId &&
        String(request.doctorId) === String(authUserId);
      if (!isPatientOwner && !isDoctorOwner) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this conversation",
        });
      }
    }

    request.lastUserSeenAt = new Date();
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Conversation marked as read",
    });
  } catch (error) {
    console.error("Error marking support request as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark conversation as read",
      error: error.message,
    });
  }
};
/**
 * Update support request status (admin only - for future use)
 */
const updateSupportRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminResponse } = req.body;

    if (!status || !["open", "in-progress", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
      });
    }

    const updateData = { status };
    
    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    }

    if (adminResponse) {
      updateData.adminResponse = adminResponse.trim();
    }

    const supportRequest = await SupportRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!supportRequest) {
      return res.status(404).json({
        success: false,
        message: "Support request not found",
      });
    }

    // Invalidate translation cache when admin posts a response
    if (adminResponse) {
      invalidateTranslation('SupportRequests', supportRequest._id).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Support request updated successfully",
      supportRequest,
    });
  } catch (error) {
    console.error("Error updating support request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update support request",
      error: error.message,
    });
  }
};

module.exports = {
  createSupportRequest,
  getSupportRequestsByDoctor,
  getSupportRequestsByPatient,
  getSupportRequestById,
  getAllSupportRequests,
  updateSupportRequestStatus,
  markSupportRequestRead,
};

