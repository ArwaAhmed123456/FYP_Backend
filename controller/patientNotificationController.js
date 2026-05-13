// controller/patientNotificationController.js
const PatientNotificationModel = require('../models/PatientNotificationModel');
const Patient = require('../models/PatientModel');
const { ObjectId } = require('mongodb');
const { translateFields, getOrCreateTranslation } = require('../services/translationService');

// Get all notifications for a patient
const getNotificationsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    if (!patientId) {
      return res.status(400).json({ 
        success: false,
        message: 'Patient ID is required' 
      });
    }

    console.log(`📬 Getting notifications for patient: ${patientId}`);
    
    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      console.error(`❌ Patient not found: ${patientId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Patient not found' 
      });
    }
    console.log(`✅ Patient found: ${patient.firstName || 'N/A'}`);

    // Debug: Check total notifications in collection
    try {
      const collection = await PatientNotificationModel.getCollection();
      const totalCount = await collection.countDocuments({});
      console.log(`📊 Total notifications in Patient_Notifications collection: ${totalCount}`);
      
      // Check a sample notification to see patientId format
      const sample = await collection.findOne({});
      if (sample) {
        console.log(`📋 Sample notification patientId: ${sample.patientId}, type: ${typeof sample.patientId}, constructor: ${sample.patientId?.constructor?.name}`);
        console.log(`📋 Sample notification patientId toString: ${sample.patientId?.toString()}`);
      } else {
        console.log(`⚠️ No notifications found in collection at all`);
      }
      
      // Check if there are any notifications with this patientId as string
      const stringCount = await collection.countDocuments({ patientId: patientId });
      console.log(`🔍 Notifications with patientId as string "${patientId}": ${stringCount}`);
      
      // Check if there are any notifications with this patientId as ObjectId
      try {
        const patientObjId = new ObjectId(patientId);
        const objectIdCount = await collection.countDocuments({ patientId: patientObjId });
        console.log(`🔍 Notifications with patientId as ObjectId: ${objectIdCount}`);
      } catch (objIdError) {
        console.log(`⚠️ Could not convert patientId to ObjectId: ${objIdError.message}`);
      }
    } catch (debugError) {
      console.error('❌ Debug query error:', debugError);
    }

    const notifications = await PatientNotificationModel.getNotificationsByPatient(
      patientId,
      parseInt(limit),
      parseInt(skip)
    );
    
    console.log(`📊 Retrieved ${notifications.length} notifications from database`);

    // Convert ObjectId to string for JSON response
    const formattedNotifications = notifications.map(notif => ({
      _id: notif._id.toString(),
      id: notif._id.toString(),
      patientId: notif.patientId?.toString(),
      type: notif.type,
      title: notif.title,
      description: notif.description,
      icon: notif.icon,
      read: notif.read,
      appointmentId: notif.appointmentId?.toString(),
      doctorName: notif.doctorName,
      deviceInfo: notif.deviceInfo,
      location: notif.location,
      actionRoute: notif.actionRoute || null,
      reviewed: notif.reviewed || false,
      // Reschedule details (for appointment_reschedule_pending type)
      oldDate: notif.oldDate ? (notif.oldDate instanceof Date ? notif.oldDate.toISOString() : notif.oldDate) : null,
      oldTime: notif.oldTime || null,
      newDate: notif.newDate ? (notif.newDate instanceof Date ? notif.newDate.toISOString() : notif.newDate) : null,
      newTime: notif.newTime || null,
      timestamp: notif.timestamp?.getTime() || notif.createdAt?.getTime(),
      dateGroup: notif.dateGroup,
      createdAt: notif.createdAt,
      updatedAt: notif.updatedAt
    }));

    // Merge Urdu translations if patient prefers Urdu
    const { getPatientLanguage } = require('../utils/getPatientLanguage');
    const lang = await getPatientLanguage(patientId);
    let finalNotifications = formattedNotifications;

    if (lang === 'ur' && formattedNotifications.length > 0) {
      const TranslationModel = require('../models/TranslationModel');
      const notifIds = formattedNotifications.map((n) => n._id);
      const cached = await TranslationModel.find({
        sourceCollection: 'Patient_Notifications',
        sourceId: { $in: notifIds },
        targetLanguage: 'ur',
      }).lean();

      const cacheMap = new Map();
      for (const entry of cached) {
        const fieldsObj = entry.fields instanceof Map
          ? Object.fromEntries(entry.fields)
          : (typeof entry.fields?.toObject === 'function'
              ? Object.fromEntries(entry.fields.toObject())
              : entry.fields);
        cacheMap.set(entry.sourceId.toString(), fieldsObj);
      }

      // Separate into cached and uncached
      const uncached = formattedNotifications.filter((n) => !cacheMap.has(n._id));

      // On-the-fly translate uncached notifications and save them to the cache (fire-and-forget)
      if (uncached.length > 0) {
        Promise.all(
          uncached.map(async (notif) => {
            try {
              const translated = await translateFields({ title: notif.title, description: notif.description }, 'ur');
              await TranslationModel.findOneAndUpdate(
                { sourceCollection: 'Patient_Notifications', sourceId: notif._id, targetLanguage: 'ur' },
                { $set: { fields: translated, updatedAt: new Date() } },
                { upsert: true }
              );
              cacheMap.set(notif._id, translated);
            } catch (_) { /* ignore per-notif errors */ }
          })
        ).catch(() => {});
      }

      finalNotifications = formattedNotifications.map((notif) => {
        const translation = cacheMap.get(notif._id);
        if (!translation) return notif;
        return {
          ...notif,
          title: translation.title ?? notif.title,
          description: translation.description ?? notif.description,
        };
      });
    }

    return res.json({
      success: true,
      notifications: finalNotifications,
      count: finalNotifications.length
    });
  } catch (err) {
    console.error('❌ getNotificationsByPatient ERROR:', err);
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
    const { patientId, type, title, description, icon, appointmentId, doctorName, deviceInfo, location, timestamp, actionRoute } = req.body;

    console.log(`📬 Creating patient notification request received`);
    console.log(`   patientId: ${patientId}`);
    console.log(`   type: ${type}`);
    console.log(`   title: ${title}`);

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title and description are required'
      });
    }

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      console.error(`❌ Patient not found: ${patientId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Patient not found' 
      });
    }
    console.log(`✅ Patient found: ${patient.firstName || 'N/A'}`);

    const notificationData = {
      patientId,
      type: type || 'info',
      title,
      description,
      icon: icon || 'notifications-outline',
      appointmentId: appointmentId || null,
      doctorName: doctorName || null,
      deviceInfo: deviceInfo || null,
      location: location || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      actionRoute: actionRoute || null,
    };

    console.log(`📝 Notification data prepared:`, {
      patientId: notificationData.patientId,
      type: notificationData.type,
      title: notificationData.title,
      hasDeviceInfo: !!notificationData.deviceInfo,
      hasLocation: !!notificationData.location,
      timestamp: notificationData.timestamp
    });

    const result = await PatientNotificationModel.createNotification(notificationData);
    const insertedId = result.insertedId;

    console.log(`✅ Notification created with ID: ${insertedId}`);

    // Pre-translate title+description to Urdu and cache immediately (fire-and-forget)
    translateFields({ title, description }, 'ur')
      .then(async (translated) => {
        const TranslationModel = require('../models/TranslationModel');
        await TranslationModel.findOneAndUpdate(
          { sourceCollection: 'Patient_Notifications', sourceId: insertedId, targetLanguage: 'ur' },
          {
            $set: { fields: translated, updatedAt: new Date() },
            $setOnInsert: { sourceCollection: 'Patient_Notifications', sourceId: insertedId, targetLanguage: 'ur', createdAt: new Date() },
          },
          { upsert: true, new: true }
        );
      })
      .catch((err) => console.error('[patientNotificationController] pre-translate error:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notificationId: insertedId.toString()
    });
  } catch (err) {
    console.error('❌ createNotification ERROR:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};

// Get unread notifications for a patient
const getUnreadNotificationsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 100 } = req.query;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const notifications = await PatientNotificationModel.getUnreadNotificationsByPatient(
      patientId,
      parseInt(limit)
    );

    const formattedNotifications = notifications.map(notif => ({
      _id: notif._id.toString(),
      id: notif._id.toString(),
      patientId: notif.patientId?.toString(),
      type: notif.type,
      title: notif.title,
      description: notif.description,
      icon: notif.icon,
      read: notif.read,
      appointmentId: notif.appointmentId?.toString(),
      doctorName: notif.doctorName,
      deviceInfo: notif.deviceInfo,
      location: notif.location,
      // Reschedule details (for appointment_reschedule_pending type)
      oldDate: notif.oldDate ? (notif.oldDate instanceof Date ? notif.oldDate.toISOString() : notif.oldDate) : null,
      oldTime: notif.oldTime || null,
      newDate: notif.newDate ? (notif.newDate instanceof Date ? notif.newDate.toISOString() : notif.newDate) : null,
      newTime: notif.newTime || null,
      timestamp: notif.timestamp?.getTime() || notif.createdAt?.getTime(),
      dateGroup: notif.dateGroup,
      createdAt: notif.createdAt
    }));

    return res.json({
      success: true,
      notifications: formattedNotifications,
      count: formattedNotifications.length
    });
  } catch (err) {
    console.error('❌ getUnreadNotificationsByPatient ERROR:', err);
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

    const result = await PatientNotificationModel.markAsRead(notificationId);

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

// Mark all notifications as read for a patient
const markAllAsReadByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const result = await PatientNotificationModel.markAllAsReadByPatient(patientId);

    return res.json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('❌ markAllAsReadByPatient ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};

// Get unread count for a patient
const getUnreadCountByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const count = await PatientNotificationModel.getUnreadCountByPatient(patientId);

    return res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error('❌ getUnreadCountByPatient ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};

// Clear all notifications for a patient
const clearAllNotificationsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    const result = await PatientNotificationModel.clearAllNotificationsByPatient(patientId);

    return res.json({
      success: true,
      message: 'All notifications cleared',
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error('❌ clearAllNotificationsByPatient ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};

// Delete a notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }

    const result = await PatientNotificationModel.deleteNotification(notificationId);

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

module.exports = {
  getNotificationsByPatient,
  createNotification,
  getUnreadNotificationsByPatient,
  markNotificationAsRead,
  markAllAsReadByPatient,
  getUnreadCountByPatient,
  clearAllNotificationsByPatient,
  deleteNotification
};

