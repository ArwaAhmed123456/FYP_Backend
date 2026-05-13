const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Admin Notification Model for MongoDB
class AdminNotificationModel {
  constructor() {
    this.collectionName = 'Admin_Notifications';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new admin notification
  async createNotification(notificationData) {
    try {
      const collection = await this.getCollection();
      
      const notification = {
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        category: notificationData.category || 'general',
        read: false,
        priority: notificationData.priority || 'medium',
        recipients: notificationData.recipients || 'admin',
        relatedEntity: notificationData.relatedEntity ? new ObjectId(notificationData.relatedEntity) : null,
        relatedEntityType: notificationData.relatedEntityType || null,
        metadata: notificationData.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };

      const result = await collection.insertOne(notification);
      console.log('✅ Admin notification created successfully:', result.insertedId);
      return result;
    } catch (error) {
      console.error('Error creating admin notification:', error);
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

  // Get all notifications for admin
  async getAllNotifications(limit = 50, skip = 0) {
    try {
      const collection = await this.getCollection();
      return await collection.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting all notifications:', error);
      throw error;
    }
  }

  // Get unread notifications
  async getUnreadNotifications(limit = 50) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ read: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting unread notifications:', error);
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

  // Mark all notifications as read
  async markAllAsRead() {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateMany(
        { read: false },
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

  // Get notifications by category
  async getNotificationsByCategory(category, limit = 50) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ category })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting notifications by category:', error);
      throw error;
    }
  }

  // Get notifications by priority
  async getNotificationsByPriority(priority, limit = 50) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ priority })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting notifications by priority:', error);
      throw error;
    }
  }

  // Get notifications count
  async getNotificationsCount() {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments({});
    } catch (error) {
      console.error('Error getting notifications count:', error);
      throw error;
    }
  }

  // Get unread notifications count
  async getUnreadNotificationsCount() {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments({ read: false });
    } catch (error) {
      console.error('Error getting unread notifications count:', error);
      throw error;
    }
  }

  // Create account anonymization request notification
  async createAnonymizationRequest(userId, userEmail, userName) {
    try {
      const notificationData = {
        title: "Account Anonymization Request",
        message: `User ${userName} (${userEmail}) has requested account anonymization. Account will be anonymized within 7 days.`,
        type: "warning",
        category: "account_management",
        priority: "high",
        recipients: "admin",
        relatedEntity: userId,
        relatedEntityType: "Patient",
        metadata: {
          requestType: "anonymization",
          requestedAt: new Date(),
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        }
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating anonymization request notification:', error);
      throw error;
    }
  }

  // Create account deletion request notification
  async createDeletionRequest(userId, userEmail, userName, deletionType = 'complete') {
    try {
      const isAnonymization = deletionType === 'anonymize';
      const notificationData = {
        title: isAnonymization ? "Account Anonymization Request" : "Account Deletion Request",
        message: isAnonymization 
          ? `User ${userName} (${userEmail}) has requested account anonymization. Data will be kept for AI training. Account will be anonymized within 7 days.`
          : `User ${userName} (${userEmail}) has requested account deletion. All data will be permanently removed. Account will be deleted within 7 days.`,
        type: isAnonymization ? "warning" : "error",
        category: "account_management",
        priority: "high",
        recipients: "admin",
        relatedEntity: userId,
        relatedEntityType: "Patient",
        metadata: {
          requestType: deletionType,
          requestedAt: new Date(),
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        }
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating deletion request notification:', error);
      throw error;
    }
  }
}

module.exports = new AdminNotificationModel();
