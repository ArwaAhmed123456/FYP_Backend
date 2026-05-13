const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Payment Method model for MongoDB
class PaymentMethodModel {
  _toObjectId(id) {
    if (typeof id === 'string') return new ObjectId(id);
    return id;
  }
  constructor() {
    this.collectionName = 'payment_methods';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Add a new payment method for a user
  async addPaymentMethod(userId, paymentData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        userId: userId,
        ...paymentData,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active'
      });
      return result;
    } catch (error) {
      console.error('Error adding payment method to MongoDB:', error);
      throw error;
    }
  }

  // Get all payment methods for a user
  async getUserPaymentMethods(userId) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ 
        userId: userId, 
        status: 'active' 
      }).sort({ createdAt: -1 }).toArray();
    } catch (error) {
      console.error('Error getting user payment methods from MongoDB:', error);
      throw error;
    }
  }

  // Get payment method by ID
  async getPaymentMethodById(paymentMethodId) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ _id: this._toObjectId(paymentMethodId) });
    } catch (error) {
      console.error('Error getting payment method from MongoDB:', error);
      throw error;
    }
  }

  // Update payment method
  async updatePaymentMethod(paymentMethodId, updateData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { _id: this._toObjectId(paymentMethodId) },
        { 
          $set: {
            ...updateData,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error updating payment method in MongoDB:', error);
      throw error;
    }
  }

  // Set default payment method
  async setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
      const collection = await this.getCollection();
      
      // First, unset all default payment methods for this user
      await collection.updateMany(
        { userId: userId },
        { $set: { isDefault: false, updatedAt: new Date() } }
      );
      
      // Then set the specified payment method as default
      const result = await collection.updateOne(
        { _id: this._toObjectId(paymentMethodId), userId: userId },
        { 
          $set: {
            isDefault: true,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error setting default payment method in MongoDB:', error);
      throw error;
    }
  }

  // Delete payment method
  async deletePaymentMethod(paymentMethodId) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { _id: this._toObjectId(paymentMethodId) },
        { 
          $set: {
            status: 'deleted',
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error deleting payment method in MongoDB:', error);
      throw error;
    }
  }

  // Get default payment method for user
  async getDefaultPaymentMethod(userId) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ 
        userId: userId, 
        isDefault: true, 
        status: 'active' 
      });
    } catch (error) {
      console.error('Error getting default payment method from MongoDB:', error);
      throw error;
    }
  }

  // Get payment methods count for user
  async getUserPaymentMethodsCount(userId) {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments({ 
        userId: userId, 
        status: 'active' 
      });
    } catch (error) {
      console.error('Error getting payment methods count from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new PaymentMethodModel();
