const express = require('express');
const router = express.Router();
const {
  submitFeedback,
  getPatientFeedbackHistory,
  getDoctorFeedbackSummary,
  getDoctorFeedbackAnalytics,
  getDoctorFeedbackList
} = require('../controller/feedbackController');

/**
 * POST /api/feedback/submit
 * Submit feedback after consultation
 */
router.post('/submit', submitFeedback);

/**
 * GET /api/patient/feedback-history
 * Get patient's feedback history
 */
router.get('/feedback-history', getPatientFeedbackHistory);

/**
 * GET /api/doctor/:id/feedback-summary
 * Get doctor feedback summary (public, for patient view)
 */
router.get('/:id/feedback-summary', getDoctorFeedbackSummary);

/**
 * GET /api/doctor/:id/feedback-analytics
 * Get doctor feedback analytics (for doctor dashboard)
 */
router.get('/:id/feedback-analytics', getDoctorFeedbackAnalytics);

/**
 * GET /api/doctor/:id/feedback-list
 * Get doctor feedback list (anonymous, paginated)
 */
router.get('/:id/feedback-list', getDoctorFeedbackList);

module.exports = router;

