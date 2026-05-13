const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Transaction model for MongoDB - Payment records
class TransactionModel {
  constructor() {
    this.collectionName = 'transactions';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new transaction record
  async createTransaction(transactionData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        userId: transactionData.userId,
        paymentIntentId: transactionData.paymentIntentId,
        amount: transactionData.amount, // in dollars
        currency: transactionData.currency || 'usd',
        status: transactionData.status || 'pending', // succeeded, failed, refunded, pending
        doctorId: transactionData.doctorId || null,
        doctorName: transactionData.doctorName || null,
        appointmentId: transactionData.appointmentId || null,
        appointmentDate: transactionData.appointmentDate || null,
        appointmentTime: transactionData.appointmentTime || null,
        appointmentType: transactionData.appointmentType || null,
        paymentMethod: transactionData.paymentMethod || null, // masked card info
        metadata: transactionData.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return result;
    } catch (error) {
      console.error('Error creating transaction in MongoDB:', error);
      throw error;
    }
  }

  // Get transaction by payment intent ID
  async getTransactionByPaymentIntentId(paymentIntentId) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ paymentIntentId: paymentIntentId });
    } catch (error) {
      console.error('Error getting transaction from MongoDB:', error);
      throw error;
    }
  }

  // Get transaction by ID
  async getTransactionById(transactionId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof transactionId === 'string' ? new ObjectId(transactionId) : transactionId;
      return await collection.findOne({ _id: objectId });
    } catch (error) {
      console.error('Error getting transaction from MongoDB:', error);
      throw error;
    }
  }

  // Get all transactions for a user (excludes pending - pending transactions are not returned)
  async getUserTransactions(userId, options = {}) {
    try {
      const collection = await this.getCollection();
      const { status, startDate, endDate, limit = 50, skip = 0 } = options;

      const query = { userId: userId };

      // Never return pending transactions (excluded from history and API)
      if (status === 'pending') {
        return { transactions: [], total: 0, page: 1, pages: Math.ceil(0 / limit) };
      }
      if (status) {
        query.status = status;
      } else {
        query.status = { $ne: 'pending' };
      }

      if (startDate || endDate) {
        query.createdAt = query.createdAt || {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const transactions = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await collection.countDocuments(query);

      return {
        transactions,
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error getting user transactions from MongoDB:', error);
      throw error;
    }
  }

  // Delete all pending transactions for a user (removes them from database)
  async deletePendingTransactions(userId) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteMany({
        userId: userId,
        status: 'pending',
      });
      return result;
    } catch (error) {
      console.error('Error deleting pending transactions from MongoDB:', error);
      throw error;
    }
  }

  // Update transaction status
  async updateTransactionStatus(paymentIntentId, status, updateData = {}) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { paymentIntentId: paymentIntentId },
        {
          $set: {
            status: status,
            ...updateData,
            updatedAt: new Date(),
          },
        }
      );
      return result;
    } catch (error) {
      console.error('Error updating transaction status in MongoDB:', error);
      throw error;
    }
  }

  // Mark transaction as refunded
  async markAsRefunded(paymentIntentId, refundData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { paymentIntentId: paymentIntentId },
        {
          $set: {
            status: 'refunded',
            refundData: refundData,
            updatedAt: new Date(),
          },
        }
      );
      return result;
    } catch (error) {
      console.error('Error marking transaction as refunded in MongoDB:', error);
      throw error;
    }
  }

  // Get transaction statistics for a user
  async getUserTransactionStats(userId) {
    try {
      const collection = await this.getCollection();
      
      const pipeline = [
        { $match: { userId: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ];

      const stats = await collection.aggregate(pipeline).toArray();
      
      const totalTransactions = await collection.countDocuments({ userId: userId });
      const totalAmount = await collection.aggregate([
        { $match: { userId: userId, status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray();

      return {
        totalTransactions,
        totalAmount: totalAmount[0]?.total || 0,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            totalAmount: stat.totalAmount,
          };
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error('Error getting transaction stats from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new TransactionModel();

