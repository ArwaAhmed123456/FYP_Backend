// routes/patientNotificationRoute.js
const express = require('express');
const {
  getNotificationsByPatient,
  createNotification,
  getUnreadNotificationsByPatient,
  markNotificationAsRead,
  markAllAsReadByPatient,
  getUnreadCountByPatient,
  clearAllNotificationsByPatient,
  deleteNotification
} = require('../controller/patientNotificationController');
const notifyMissedAppointments = require('../scripts/notifyMissedAppointments');

const router = express.Router();

// GET: /api/patient/notifications/patient/:patientId - Get all notifications for a patient
router.get('/patient/:patientId', getNotificationsByPatient);

// GET: /api/patient/notifications/unread/:patientId - Get unread notifications for a patient
router.get('/unread/:patientId', getUnreadNotificationsByPatient);

// GET: /api/patient/notifications/unread-count/:patientId - Get unread count
router.get('/unread-count/:patientId', getUnreadCountByPatient);

// POST: /api/patient/notifications - Create a new notification
router.post('/', createNotification);

// PUT: /api/patient/notifications/:notificationId/read - Mark notification as read
router.put('/:notificationId/read', markNotificationAsRead);

// PUT: /api/patient/notifications/patient/:patientId/read-all - Mark all notifications as read
router.put('/patient/:patientId/read-all', markAllAsReadByPatient);

// DELETE: /api/patient/notifications/:notificationId - Delete a notification
router.delete('/:notificationId', deleteNotification);

// DELETE: /api/patient/notifications/patient/:patientId/clear - Clear all notifications for a patient
router.delete('/patient/:patientId/clear', clearAllNotificationsByPatient);

// POST: /api/patient/notifications/check-missed - Manually trigger missed appointments notification check
router.post('/check-missed', async (req, res) => {
  try {
    console.log('🔔 Manual missed appointments notification check triggered');
    const result = await notifyMissedAppointments();
    res.json({
      success: true,
      message: 'Missed appointments notification check completed',
      ...result
    });
  } catch (error) {
    console.error('❌ Error in manual missed appointments check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check missed appointments',
      error: error.message
    });
  }
});

module.exports = router;

