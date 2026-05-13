const { getCollection } = require('../services/mongodb');

// User Settings model for MongoDB
class UserSettingsModel {
  constructor() {
    this.collectionName = 'user_settings';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create or update user settings
  async upsertUserSettings(userId, settingsData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { userId: userId },
        { 
          $set: {
            ...settingsData,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return result;
    } catch (error) {
      console.error('Error upserting user settings in MongoDB:', error);
      throw error;
    }
  }

  // Get user settings
  async getUserSettings(userId) {
    try {
      const collection = await this.getCollection();
      const settings = await collection.findOne({ userId: userId });
      
      // Return default settings if none exist
      if (!settings) {
        return this.getDefaultSettings();
      }
      
      return settings;
    } catch (error) {
      console.error('Error getting user settings from MongoDB:', error);
      throw error;
    }
  }

  // Update notification settings
  async updateNotificationSettings(userId, notificationSettings) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { userId: userId },
        { 
          $set: {
            'notifications.generalNotification': notificationSettings.generalNotification,
            'notifications.sound': notificationSettings.sound,
            'notifications.soundCall': notificationSettings.soundCall,
            'notifications.vibrate': notificationSettings.vibrate,
            'notifications.appointmentReminders': notificationSettings.appointmentReminders,
            'notifications.payments': notificationSettings.payments,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return result;
    } catch (error) {
      console.error('Error updating notification settings in MongoDB:', error);
      throw error;
    }
  }

  // Update language preference
  async updateLanguagePreference(userId, language) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { userId: userId },
        { 
          $set: {
            language: language,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return result;
    } catch (error) {
      console.error('Error updating language preference in MongoDB:', error);
      throw error;
    }
  }

  // Update privacy settings
  async updatePrivacySettings(userId, privacySettings) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { userId: userId },
        { 
          $set: {
            'privacy.profileVisibility': privacySettings.profileVisibility,
            'privacy.dataSharing': privacySettings.dataSharing,
            'privacy.marketingEmails': privacySettings.marketingEmails,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return result;
    } catch (error) {
      console.error('Error updating privacy settings in MongoDB:', error);
      throw error;
    }
  }

  // Delete user settings
  async deleteUserSettings(userId) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ userId: userId });
      return result;
    } catch (error) {
      console.error('Error deleting user settings from MongoDB:', error);
      throw error;
    }
  }

  // Get default settings
  getDefaultSettings() {
    return {
      userId: null,
      language: 'en',
      notifications: {
        generalNotification: true,
        sound: true,
        soundCall: true,
        vibrate: false,
        appointmentReminders: true,
        payments: true
      },
      privacy: {
        profileVisibility: 'public',
        dataSharing: false,
        marketingEmails: false
      },
      theme: 'light',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // Get all user settings (for admin purposes)
  async getAllUserSettings(limit = 50, skip = 0) {
    try {
      const collection = await this.getCollection();
      return await collection.find({})
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting all user settings from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new UserSettingsModel();
