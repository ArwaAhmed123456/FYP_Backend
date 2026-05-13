const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Patient Notification Model for MongoDB
class PatientNotificationModel {
  constructor() {
    this.collectionName = 'Patient_Notifications';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new patient notification
  async createNotification(notificationData) {
    try {
      const collection = await this.getCollection();
      
      // Convert patientId to ObjectId if it's a string
      let patientIdValue = null;
      if (notificationData.patientId) {
        try {
          patientIdValue = typeof notificationData.patientId === 'string' 
            ? new ObjectId(notificationData.patientId) 
            : notificationData.patientId;
        } catch (error) {
          console.error('Error converting patientId to ObjectId:', error);
          // If conversion fails, store as string
          patientIdValue = notificationData.patientId;
        }
      }
      
      // Convert appointmentId to ObjectId if it's a string
      let appointmentIdValue = null;
      if (notificationData.appointmentId) {
        try {
          appointmentIdValue = typeof notificationData.appointmentId === 'string' 
            ? new ObjectId(notificationData.appointmentId) 
            : notificationData.appointmentId;
        } catch (error) {
          console.error('Error converting appointmentId to ObjectId:', error);
          appointmentIdValue = notificationData.appointmentId;
        }
      }
      
      const notification = {
        patientId: patientIdValue,
        type: notificationData.type || 'info',
        title: notificationData.title,
        description: notificationData.description,
        icon: notificationData.icon || 'notifications-outline',
        read: false,
        appointmentId: appointmentIdValue,
        doctorName: notificationData.doctorName || null,
        deviceInfo: notificationData.deviceInfo || null,
        location: notificationData.location || null,
        // Reschedule details (for appointment_reschedule_pending type)
        oldDate: notificationData.oldDate || null,
        oldTime: notificationData.oldTime || null,
        newDate: notificationData.newDate || null,
        newTime: notificationData.newTime || null,
        actionRoute: notificationData.actionRoute || null,
        timestamp: notificationData.timestamp ? new Date(notificationData.timestamp) : new Date(),
        dateGroup: notificationData.dateGroup || this.getDateGroup(new Date()),
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };

      console.log(`📝 Creating notification for patientId: ${notificationData.patientId} (stored as: ${patientIdValue})`);
      const result = await collection.insertOne(notification);
      console.log('✅ Patient notification created successfully:', result.insertedId);
      return result;
    } catch (error) {
      console.error('❌ Error creating patient notification:', error);
      throw error;
    }
  }

  // Get notification by ID
  async getNotificationById(notificationId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof notificationId === 'string' ? new ObjectId(notificationId) : notificationId;
      return await collection.findOne({ _id: objectId });
    } catch (error) {
      console.error('Error getting notification by ID:', error);
      throw error;
    }
  }

  // Get all notifications for a patient
  async getNotificationsByPatient(patientId, limit = 100, skip = 0) {
    try {
      const collection = await this.getCollection();
      
      // Try querying with both ObjectId and string formats to handle any data inconsistencies
      let patientObjectId;
      try {
        patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      } catch (error) {
        console.error('Error converting patientId to ObjectId:', error);
        // If conversion fails, use string format
        patientObjectId = patientId;
      }
      
      console.log(`🔍 Querying notifications for patientId: ${patientId} (as ObjectId: ${patientObjectId})`);
      
      // Build comprehensive query that handles all possible patientId formats
      // MongoDB can store patientId as: ObjectId, String, or String representation of ObjectId
      let queryConditions = [];
      
      // Add ObjectId format
      if (patientObjectId && patientObjectId.constructor && patientObjectId.constructor.name === 'ObjectId') {
        queryConditions.push({ patientId: patientObjectId });
      }
      
      // Add string format
      if (typeof patientId === 'string') {
        queryConditions.push({ patientId: patientId });
        
        // Also try matching ObjectId's string representation
        // Some documents might have patientId stored as ObjectId but we need to match by string
        try {
          // Query where patientId (if ObjectId) converts to this string
          queryConditions.push({ 
            $expr: { 
              $eq: [
                { $toString: "$patientId" },
                patientId
              ]
            }
          });
        } catch (exprError) {
          console.log('Could not add $expr query:', exprError.message);
        }
      }
      
      // Use $or if we have multiple conditions, otherwise use single condition
      const query = queryConditions.length > 1 
        ? { $or: queryConditions }
        : queryConditions[0] || { patientId: patientObjectId || patientId };
      
      console.log(`🔍 Executing query with ${queryConditions.length} condition(s)...`);
      
      let notifications = await collection.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      console.log(`✅ Found ${notifications.length} notifications for patient ${patientId}`);
      
      // Log first notification's patientId format for debugging
      if (notifications.length > 0) {
        const firstNotif = notifications[0];
        const patientIdType = firstNotif.patientId?.constructor?.name || typeof firstNotif.patientId;
        const patientIdValue = firstNotif.patientId?.toString ? firstNotif.patientId.toString() : firstNotif.patientId;
        console.log(`📋 Sample notification patientId: ${patientIdValue}, type: ${patientIdType}`);
      } else {
        // If no results, try a direct find to see what's in the collection
        const allNotifications = await collection.find({}).limit(5).toArray();
        if (allNotifications.length > 0) {
          console.log(`⚠️ Found ${allNotifications.length} notifications in collection, but none match patientId ${patientId}`);
          allNotifications.forEach((notif, idx) => {
            const notifPatientId = notif.patientId?.toString ? notif.patientId.toString() : notif.patientId;
            console.log(`   Notification ${idx + 1} patientId: ${notifPatientId} (type: ${notif.patientId?.constructor?.name || typeof notif.patientId})`);
          });
        }
      }
      
      return notifications;
    } catch (error) {
      console.error('❌ Error getting notifications by patient:', error);
      throw error;
    }
  }

  // Get unread notifications for a patient
  async getUnreadNotificationsByPatient(patientId, limit = 100) {
    try {
      const collection = await this.getCollection();
      const patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      
      return await collection.find({ 
        patientId: patientObjectId,
        read: false 
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting unread notifications by patient:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof notificationId === 'string' ? new ObjectId(notificationId) : notificationId;
      
      const result = await collection.updateOne(
        { _id: objectId },
        { 
          $set: {
            read: true,
            updatedAt: new Date()
          }
        }
      );
      
      return result;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for a patient
  async markAllAsReadByPatient(patientId) {
    try {
      const collection = await this.getCollection();
      const patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      
      const result = await collection.updateMany(
        { 
          patientId: patientObjectId,
          read: false 
        },
        { 
          $set: {
            read: true,
            updatedAt: new Date()
          }
        }
      );
      
      return result;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Delete notification
  async deleteNotification(notificationId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof notificationId === 'string' ? new ObjectId(notificationId) : notificationId;
      
      const result = await collection.deleteOne({ _id: objectId });
      return result;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  // Clear all notifications for a patient
  async clearAllNotificationsByPatient(patientId) {
    try {
      const collection = await this.getCollection();
      const patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      
      const result = await collection.deleteMany({ patientId: patientObjectId });
      return result;
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }

  // Get unread count for a patient
  async getUnreadCountByPatient(patientId) {
    try {
      const collection = await this.getCollection();
      const patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      
      return await collection.countDocuments({ 
        patientId: patientObjectId,
        read: false 
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  // Get date group helper
  getDateGroup(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const notificationDate = new Date(date);
    notificationDate.setHours(0, 0, 0, 0);
    
    if (notificationDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (notificationDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${date.getDate()} ${monthNames[date.getMonth()]}`;
    }
  }

  // Check if notification exists for appointment (to avoid duplicates)
  async notificationExistsForAppointment(patientId, appointmentId, type) {
    try {
      const collection = await this.getCollection();
      const patientObjectId = typeof patientId === 'string' ? new ObjectId(patientId) : patientId;
      const appointmentObjectId = typeof appointmentId === 'string' ? new ObjectId(appointmentId) : appointmentId;
      
      const existing = await collection.findOne({
        patientId: patientObjectId,
        appointmentId: appointmentObjectId,
        type: type
      });
      
      return existing !== null;
    } catch (error) {
      console.error('Error checking notification existence:', error);
      return false;
    }
  }
}

module.exports = new PatientNotificationModel();

