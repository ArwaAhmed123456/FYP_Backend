const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// OTP Model for storing verification codes
class OTPModel {
  constructor() {
    this.collectionName = 'OTPVerifications';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Store OTP verification record
  async createOTPRecord(otpData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        contact: otpData.contact, // phone number or email
        method: otpData.method, // 'phone' or 'email'
        userType: otpData.userType || 'patient', // 'patient' or 'doctor'
        otpCode: otpData.otpCode,
        verificationToken: otpData.verificationToken,
        expiresAt: otpData.expiresAt,
        isVerified: false,
        attempts: 0,
        maxAttempts: 3,
        userData: otpData.userData || {}, // Store additional user data
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return result;
    } catch (error) {
      console.error('Error creating OTP record:', error);
      throw error;
    }
  }

  // Get OTP record by verification token
  async getOTPByToken(verificationToken) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ verificationToken });
    } catch (error) {
      console.error('Error getting OTP by token:', error);
      throw error;
    }
  }

  // Get OTP record by contact and method
  async getOTPByContact(contact, method) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ 
        contact, 
        method,
        isVerified: false,
        expiresAt: { $gt: new Date() } // Only get non-expired records
      });
    } catch (error) {
      console.error('Error getting OTP by contact:', error);
      throw error;
    }
  }

  // Update OTP verification status
  async updateOTPVerification(verificationToken, isVerified) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { verificationToken },
        { 
          $set: {
            isVerified,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error updating OTP verification:', error);
      throw error;
    }
  }

  // Increment attempt count
  async incrementAttempts(verificationToken) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { verificationToken },
        { 
          $inc: { attempts: 1 },
          $set: { updatedAt: new Date() }
        }
      );
      return result;
    } catch (error) {
      console.error('Error incrementing attempts:', error);
      throw error;
    }
  }

  // Check if max attempts reached
  async isMaxAttemptsReached(verificationToken) {
    try {
      const collection = await this.getCollection();
      const otpRecord = await collection.findOne({ verificationToken });
      
      if (!otpRecord) {
        return true; // If record doesn't exist, consider it as max attempts reached
      }
      
      return otpRecord.attempts >= otpRecord.maxAttempts;
    } catch (error) {
      console.error('Error checking max attempts:', error);
      return true; // On error, consider it as max attempts reached
    }
  }

  // Delete expired OTP records
  async deleteExpiredOTPs() {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      console.log(`Deleted ${result.deletedCount} expired OTP records`);
      return result;
    } catch (error) {
      console.error('Error deleting expired OTPs:', error);
      throw error;
    }
  }

  // Delete OTP record by verification token
  async deleteOTPRecord(verificationToken) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ verificationToken });
      return result;
    } catch (error) {
      console.error('Error deleting OTP record:', error);
      throw error;
    }
  }

  // Delete OTP record by contact and method
  async deleteOTPByContact(contact, method) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ contact, method });
      console.log(`Deleted OTP record for ${method}: ${contact}`);
      return result;
    } catch (error) {
      console.error('Error deleting OTP by contact:', error);
      throw error;
    }
  }

  // Get OTP statistics (for monitoring)
  async getOTPStats() {
    try {
      const collection = await this.getCollection();
      const total = await collection.countDocuments();
      const verified = await collection.countDocuments({ isVerified: true });
      const expired = await collection.countDocuments({ expiresAt: { $lt: new Date() } });
      const active = await collection.countDocuments({ 
        isVerified: false, 
        expiresAt: { $gt: new Date() } 
      });
      
      return {
        total,
        verified,
        expired,
        active
      };
    } catch (error) {
      console.error('Error getting OTP stats:', error);
      throw error;
    }
  }

  // Clean up old OTP records (older than 24 hours)
  async cleanupOldOTPs() {
    try {
      const collection = await this.getCollection();
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const result = await collection.deleteMany({
        createdAt: { $lt: cutoffDate }
      });
      
      console.log(`Cleaned up ${result.deletedCount} old OTP records`);
      return result;
    } catch (error) {
      console.error('Error cleaning up old OTPs:', error);
      throw error;
    }
  }

  // Get OTP records by user type
  async getOTPsByUserType(userType) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ userType }).toArray();
    } catch (error) {
      console.error('Error getting OTPs by user type:', error);
      throw error;
    }
  }

  // Get OTP statistics by user type
  async getOTPStatsByUserType(userType) {
    try {
      const collection = await this.getCollection();
      const total = await collection.countDocuments({ userType });
      const verified = await collection.countDocuments({ userType, isVerified: true });
      const expired = await collection.countDocuments({ 
        userType, 
        expiresAt: { $lt: new Date() } 
      });
      const active = await collection.countDocuments({ 
        userType,
        isVerified: false, 
        expiresAt: { $gt: new Date() } 
      });
      
      return {
        userType,
        total,
        verified,
        expired,
        active
      };
    } catch (error) {
      console.error('Error getting OTP stats by user type:', error);
      throw error;
    }
  }

  // Get doctor verification OTPs
  async getDoctorVerificationOTPs() {
    try {
      const collection = await this.getCollection();
      return await collection.find({ userType: 'doctor' }).toArray();
    } catch (error) {
      console.error('Error getting doctor verification OTPs:', error);
      throw error;
    }
  }

  // Get patient verification OTPs
  async getPatientVerificationOTPs() {
    try {
      const collection = await this.getCollection();
      return await collection.find({ userType: 'patient' }).toArray();
    } catch (error) {
      console.error('Error getting patient verification OTPs:', error);
      throw error;
    }
  }
}

module.exports = new OTPModel();
