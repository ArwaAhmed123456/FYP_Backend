/**
 * Admin-only refund routes (Patient backend).
 * Used by doc-patient-panel so admin can list and approve/reject refund requests from patients.
 * Uses same admin JWT as support routes (doc-patient-panel token).
 */
const express = require("express");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const authService = require("../services/auth");
const RefundRequestModel = require("../models/RefundRequestModel");
const PatientNotificationModel = require("../models/PatientNotificationModel");

const router = express.Router();
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required" });
  }
  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
    return next();
  } catch (_) {
    if (ADMIN_JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (decoded && decoded.id) {
          req.user = { userId: decoded.id, userRole: "admin", role: "admin" };
          return next();
        }
      } catch (__) {}
    }
    return res.status(403).json({ success: false, message: "Invalid or expired token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const role = (req.user.userRole || req.user.role || "").toLowerCase();
  if (role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

// GET /api/payment/refund-requests/admin - list all refund requests (admin)
router.get("/admin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const status = req.query.status || "all";

    const { refundRequests, total } = await RefundRequestModel.getAllRefundRequests({
      status: status === "all" ? undefined : status,
      limit,
      skip,
    });

    return res.json({
      success: true,
      refundRequests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing refund requests (admin):", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list refund requests",
      error: error.message,
    });
  }
});

// POST /api/payment/refund-requests/:id/decision - approve or reject (admin)
router.post("/:id/decision", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, feedback } = req.body; // decision: 'approve' | 'reject'

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "decision must be 'approve' or 'reject'",
      });
    }
    if (decision === "reject" && !(feedback && String(feedback).trim())) {
      return res.status(400).json({
        success: false,
        message: "feedback is required when rejecting",
      });
    }

    const refund = await RefundRequestModel.getRefundRequestById(id);
    if (!refund) {
      return res.status(404).json({
        success: false,
        message: "Refund request not found",
      });
    }
    if (refund.status !== "requested") {
      return res.status(400).json({
        success: false,
        message: `Refund request is already ${refund.status}`,
      });
    }

    if (decision === "approve") {
      let stripeRefundId = null;

      if (refund.paymentIntentId) {
        try {
          const stripeRefund = await stripe.refunds.create(
            {
              payment_intent: refund.paymentIntentId,
              amount: Math.round(refund.amount * 100), // cents
              metadata: { refundRequestId: id, reason: refund.reason || "admin_approved" },
            },
            { idempotencyKey: `refund-${id}` }
          );
          stripeRefundId = stripeRefund.id;
          console.log(`Stripe refund created: ${stripeRefundId} for PaymentIntent ${refund.paymentIntentId}`);
        } catch (stripeErr) {
          console.error("Stripe refund creation failed:", stripeErr);
          return res.status(502).json({
            success: false,
            message: `Stripe refund failed: ${stripeErr.message}`,
          });
        }
      } else {
        console.warn(`Refund request ${id} has no paymentIntentId — updating DB status only`);
      }

      await RefundRequestModel.approveRefund(id, stripeRefundId);
    } else {
      await RefundRequestModel.rejectRefund(id, String(feedback).trim());
    }

    try {
      await PatientNotificationModel.createNotification({
        patientId: refund.userId,
        type: decision === "approve" ? "refund_approved" : "refund_rejected",
        title: decision === "approve" ? "Refund approved" : "Refund request declined",
        description:
          decision === "approve"
            ? `Your refund request for $${refund.amount} has been approved and will be processed.`
            : `Your refund request was declined. ${feedback || ""}`,
        icon: "cash-outline",
      });
    } catch (notifErr) {
      console.error("Failed to notify patient:", notifErr);
    }

    const updated = await RefundRequestModel.getRefundRequestById(id);
    return res.json({
      success: true,
      message: decision === "approve" ? "Refund approved" : "Refund rejected",
      refundRequest: updated,
    });
  } catch (error) {
    console.error("Error deciding refund (admin):", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update refund request",
      error: error.message,
    });
  }
});

module.exports = router;
