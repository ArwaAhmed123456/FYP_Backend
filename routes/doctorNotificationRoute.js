// routes/doctorNotificationRoute.js
const express = require('express');
const {
  getNotificationsByDoctor,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadCount
} = require('../controller/doctorNotificationController');

const router = express.Router();

// GET: /api/doctor/notifications/doctor/:doctorId - Get all notifications for a doctor
router.get('/doctor/:doctorId', getNotificationsByDoctor);

// GET: /api/doctor/notifications/unread/:doctorId - Get unread count
router.get('/unread/:doctorId', getUnreadCount);

// POST: /api/doctor/notifications - Create a new notification
router.post('/', createNotification);

// PUT: /api/doctor/notifications/:notificationId/read - Mark notification as read
router.put('/:notificationId/read', markNotificationAsRead);

// PUT: /api/doctor/notifications/doctor/:doctorId/read-all - Mark all notifications as read
router.put('/doctor/:doctorId/read-all', markAllNotificationsAsRead);

// DELETE: /api/doctor/notifications/:notificationId - Delete a notification
router.delete('/:notificationId', deleteNotification);

// DELETE: /api/doctor/notifications/doctor/:doctorId/clear - Clear all notifications for a doctor
router.delete('/doctor/:doctorId/clear', clearAllNotifications);

module.exports = router;

