const { MongoClient } = require('mongodb');

class PasswordResetTokenModel {
  constructor() {
    this.collectionName = 'Patient Password Reset Token';
    this.client = null;
    this.db = null;
  }

  async getCollection() {
    if (!this.client) {
      this.client = new MongoClient(process.env.MONGO_URI);
      await this.client.connect();
      this.db = this.client.db(process.env.DATABASE_NAME);
    }
    return this.db.collection(this.collectionName);
  }

  // Create a new password reset token
  async createResetToken(userId, email, token, expiresAt) {
    try {
      const collection = await this.getCollection();
      
      // Only delete expired or used tokens, keep recent valid tokens
      await this.deleteExpiredTokens();
      await this.deleteUsedTokensByUserId(userId);
      
      // Check if user has too many recent tokens (limit to 3)
      const recentTokens = await collection.find({
        userId: userId,
        used: false,
        expiresAt: { $gt: new Date() }
      }).toArray();
      
      if (recentTokens.length >= 3) {
        // Delete the oldest token
        const oldestToken = recentTokens.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
        await collection.deleteOne({ _id: oldestToken._id });
        console.log('Deleted oldest token to make room for new one');
      }
      
      const resetToken = {
        userId,
        email,
        token,
        expiresAt,
        used: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await collection.insertOne(resetToken);
      console.log('Password reset token created:', result.insertedId);
      return result;
    } catch (error) {
      console.error('Error creating password reset token:', error);
      throw error;
    }
  }

  // Get reset token by token string
  async getResetTokenByToken(token) {
    try {
      const collection = await this.getCollection();
      const resetToken = await collection.findOne({ token });
      return resetToken;
    } catch (error) {
      console.error('Error getting reset token by token:', error);
      throw error;
    }
  }

  // Get reset token by user ID
  async getResetTokenByUserId(userId) {
    try {
      const collection = await this.getCollection();
      const resetToken = await collection.findOne({ userId, used: false });
      return resetToken;
    } catch (error) {
      console.error('Error getting reset token by user ID:', error);
      throw error;
    }
  }

  // Mark token as used
  async markTokenAsUsed(token) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { token },
        { 
          $set: { 
            used: true, 
            updatedAt: new Date() 
          } 
        }
      );
      console.log('Password reset token marked as used');
      return result;
    } catch (error) {
      console.error('Error marking token as used:', error);
      throw error;
    }
  }

  // Delete token by token string
  async deleteToken(token) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ token });
      console.log('Password reset token deleted');
      return result;
    } catch (error) {
      console.error('Error deleting reset token:', error);
      throw error;
    }
  }

  // Delete all tokens for a user
  async deleteTokensByUserId(userId) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteMany({ userId });
      console.log(`Deleted ${result.deletedCount} reset tokens for user ${userId}`);
      return result;
    } catch (error) {
      console.error('Error deleting tokens by user ID:', error);
      throw error;
    }
  }

  // Delete only used tokens for a user
  async deleteUsedTokensByUserId(userId) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteMany({ userId, used: true });
      console.log(`Deleted ${result.deletedCount} used reset tokens for user ${userId}`);
      return result;
    } catch (error) {
      console.error('Error deleting used tokens by user ID:', error);
      throw error;
    }
  }

  // Delete expired tokens
  async deleteExpiredTokens() {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      console.log(`Deleted ${result.deletedCount} expired reset tokens`);
      return result;
    } catch (error) {
      console.error('Error deleting expired tokens:', error);
      throw error;
    }
  }

  // Check if token is valid (not expired and not used)
  async isTokenValid(token) {
    try {
      const resetToken = await this.getResetTokenByToken(token);
      
      if (!resetToken) {
        return { valid: false, reason: 'Token not found' };
      }

      if (resetToken.used) {
        return { valid: false, reason: 'Token already used' };
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return { valid: false, reason: 'Token expired' };
      }

      return { valid: true, resetToken };
    } catch (error) {
      console.error('Error checking token validity:', error);
      return { valid: false, reason: 'Error checking token' };
    }
  }
}

module.exports = new PasswordResetTokenModel();
