const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Doctor Notification Model for MongoDB
class DoctorNotificationModel {
  constructor() {
    this.collectionName = 'Doctor_Notifications';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new doctor notification
  async createNotification(notificationData) {
    try {
      const collection = await this.getCollection();
      
      const notification = {
        doctorId: notificationData.doctorId ? new ObjectId(notificationData.doctorId) : null,
        type: notificationData.type || 'info',
        title: notificationData.title,
        description: notificationData.description,
        icon: notificationData.icon || 'notifications-outline',
        read: false,
        appointmentId: notificationData.appointmentId ? new ObjectId(notificationData.appointmentId) : null,
        patientName: notificationData.patientName || null,
        deviceInfo: notificationData.deviceInfo || null,
        location: notificationData.location || null,
        timestamp: notificationData.timestamp || new Date(),
        dateGroup: notificationData.dateGroup || this.getDateGroup(new Date()),
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };

      const result = await collection.insertOne(notification);
      console.log('✅ Doctor notification created successfully:', result.insertedId);
      return result;
    } catch (error) {
      console.error('Error creating doctor notification:', error);
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

  // Get all notifications for a doctor
  async getNotificationsByDoctor(doctorId, limit = 100, skip = 0) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      
      return await collection.find({ doctorId: doctorObjectId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting notifications by doctor:', error);
      throw error;
    }
  }

  // Get unread notifications for a doctor
  async getUnreadNotificationsByDoctor(doctorId, limit = 100) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      
      return await collection.find({ 
        doctorId: doctorObjectId,
        read: false 
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting unread notifications by doctor:', error);
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

  // Mark all notifications as read for a doctor
  async markAllAsReadByDoctor(doctorId) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      
      const result = await collection.updateMany(
        { 
          doctorId: doctorObjectId,
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

  // Clear all notifications for a doctor
  async clearAllNotificationsByDoctor(doctorId) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      
      const result = await collection.deleteMany({ doctorId: doctorObjectId });
      return result;
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }

  // Get unread count for a doctor
  async getUnreadCountByDoctor(doctorId) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      
      return await collection.countDocuments({ 
        doctorId: doctorObjectId,
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
  async notificationExistsForAppointment(doctorId, appointmentId, type) {
    try {
      const collection = await this.getCollection();
      const doctorObjectId = typeof doctorId === 'string' ? new ObjectId(doctorId) : doctorId;
      const appointmentObjectId = typeof appointmentId === 'string' ? new ObjectId(appointmentId) : appointmentId;
      
      const existing = await collection.findOne({
        doctorId: doctorObjectId,
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

module.exports = new DoctorNotificationModel();

