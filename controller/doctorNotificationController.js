// controller/doctorNotificationController.js
const DoctorNotificationModel = require('../models/DoctorNotificationModel');
const Doctor = require('../models/DoctorModel');
const { ObjectId } = require('mongodb');

// Get all notifications for a doctor
const getNotificationsByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    if (!doctorId) {
      return res.status(400).json({ 
        success: false,
        message: 'Doctor ID is required' 
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ 
        success: false,
        message: 'Doctor not found' 
      });
    }

    const notifications = await DoctorNotificationModel.getNotificationsByDoctor(
      doctorId,
      parseInt(limit),
      parseInt(skip)
    );

    // Convert ObjectId to string for JSON response
    const formattedNotifications = notifications.map(notif => ({
      _id: notif._id.toString(),
      id: notif._id.toString(),
      doctorId: notif.doctorId?.toString(),
      type: notif.type,
      title: notif.title,
      description: notif.description,
      icon: notif.icon,
      read: notif.read,
      appointmentId: notif.appointmentId?.toString(),
      patientName: notif.patientName,
      deviceInfo: notif.deviceInfo,
      location: notif.location,
      timestamp: notif.timestamp?.getTime() || notif.createdAt?.getTime(),
      dateGroup: notif.dateGroup,
      createdAt: notif.createdAt,
      updatedAt: notif.updatedAt
    }));

    return res.json({
      success: true,
      notifications: formattedNotifications,
      count: formattedNotifications.length
    });
  } catch (err) {
    console.error('❌ getNotificationsByDoctor ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

    // Create a new notification
const createNotification = async (req, res) => {
  try {
    const { doctorId, type, title, description, icon, appointmentId, patientName, deviceInfo, location } = req.body;

    if (!doctorId || !type || !title || !description) {
      return res.status(400).json({ 
        success: false,
        message: 'Doctor ID, type, title, and description are required' 
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ 
        success: false,
        message: 'Doctor not found' 
      });
    }

    // Check for duplicate appointment notifications
    if (appointmentId && (type === 'appointment_booked' || type === 'appointment_cancelled')) {
      const exists = await DoctorNotificationModel.notificationExistsForAppointment(
        doctorId,
        appointmentId,
        type
      );
      if (exists) {
        return res.status(200).json({
          success: true,
          message: 'Notification already exists for this appointment',
          duplicate: true
        });
      }
    }

    const notificationData = {
      doctorId,
      type,
      title,
      description,
      icon: icon || 'notifications-outline',
      appointmentId,
      patientName,
      deviceInfo,
      location,
      timestamp: new Date()
    };

    const result = await DoctorNotificationModel.createNotification(notificationData);
    const notification = await DoctorNotificationModel.getNotificationById(result.insertedId);

    // Format for response
    const formattedNotification = {
      _id: notification._id.toString(),
      id: notification._id.toString(),
      doctorId: notification.doctorId?.toString(),
      type: notification.type,
      title: notification.title,
      description: notification.description,
      icon: notification.icon,
      read: notification.read,
      appointmentId: notification.appointmentId?.toString(),
      patientName: notification.patientName,
      deviceInfo: notification.deviceInfo,
      location: notification.location,
      timestamp: notification.timestamp?.getTime() || notification.createdAt?.getTime(),
      dateGroup: notification.dateGroup,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt
    };

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification: formattedNotification
    });
  } catch (err) {
    console.error('❌ createNotification ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ 
        success: false,
        message: 'Notification ID is required' 
      });
    }

    const result = await DoctorNotificationModel.markAsRead(notificationId);

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found' 
      });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (err) {
    console.error('❌ markNotificationAsRead ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

// Mark all notifications as read for a doctor
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({ 
        success: false,
        message: 'Doctor ID is required' 
      });
    }

    const result = await DoctorNotificationModel.markAllAsReadByDoctor(doctorId);

    return res.json({
      success: true,
      message: `${result.modifiedCount} notification(s) marked as read`
    });
  } catch (err) {
    console.error('❌ markAllNotificationsAsRead ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ 
        success: false,
        message: 'Notification ID is required' 
      });
    }

    const result = await DoctorNotificationModel.deleteNotification(notificationId);

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Notification not found' 
      });
    }

    return res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (err) {
    console.error('❌ deleteNotification ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

// Clear all notifications for a doctor
const clearAllNotifications = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({ 
        success: false,
        message: 'Doctor ID is required' 
      });
    }

    const result = await DoctorNotificationModel.clearAllNotificationsByDoctor(doctorId);

    return res.json({
      success: true,
      message: `${result.deletedCount} notification(s) cleared`
    });
  } catch (err) {
    console.error('❌ clearAllNotifications ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({ 
        success: false,
        message: 'Doctor ID is required' 
      });
    }

    const count = await DoctorNotificationModel.getUnreadCountByDoctor(doctorId);

    return res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error('❌ getUnreadCount ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: err.message 
    });
  }
};

module.exports = {
  getNotificationsByDoctor,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadCount
};

