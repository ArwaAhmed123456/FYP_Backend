const express = require('express');
const router = express.Router();
const {
  getAdminFeedbackAnalytics,
  refreshAdminFeedbackAnalytics,
  getAdminFeedbackList,
  runBatchSentiment
} = require('../controller/adminFeedbackAnalyticsController');

// Internal service secret — only the admin panel backend is allowed to trigger batch runs
const requireInternalServiceSecret = (req, res, next) => {
  const secret = req.headers['x-internal-service-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected || !secret || secret !== expected) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: internal service access only'
    });
  }
  next();
};

/**
 * GET /admin/feedback-analytics
 */
router.get('/feedback-analytics', getAdminFeedbackAnalytics);

/**
 * POST /admin/feedback-analytics/refresh
 */
router.post('/feedback-analytics/refresh', refreshAdminFeedbackAnalytics);

/**
 * GET /admin/feedback-list
 */
router.get('/feedback-list', getAdminFeedbackList);

/**
 * POST /admin/sentiment/run-batch
 * Internal-only: called by the admin panel backend after Super Admin role check
 */
router.post('/sentiment/run-batch', requireInternalServiceSecret, runBatchSentiment);

module.exports = router;

