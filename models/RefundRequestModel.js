const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Refund Request model for MongoDB
class RefundRequestModel {
  constructor() {
    this.collectionName = 'refund_requests';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new refund request
  async createRefundRequest(refundData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        userId: refundData.userId,
        transactionId: refundData.transactionId,
        paymentIntentId: refundData.paymentIntentId,
        amount: refundData.amount, // in dollars
        currency: refundData.currency || 'usd',
        status: 'requested', // requested, approved, processing, completed, rejected
        reason: refundData.reason,
        additionalNotes: refundData.additionalNotes || '',
        appointmentId: refundData.appointmentId || null,
        doctorId: refundData.doctorId || null,
        stripeRefundId: null, // Will be set when processed
        processedAt: null,
        completedAt: null,
        rejectionReason: null,
        metadata: refundData.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return result;
    } catch (error) {
      console.error('Error creating refund request in MongoDB:', error);
      throw error;
    }
  }

  // Get refund request by ID
  async getRefundRequestById(refundRequestId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof refundRequestId === 'string' ? new ObjectId(refundRequestId) : refundRequestId;
      return await collection.findOne({ _id: objectId });
    } catch (error) {
      console.error('Error getting refund request from MongoDB:', error);
      throw error;
    }
  }

  // Get all refund requests (admin)
  async getAllRefundRequests(options = {}) {
    try {
      const collection = await this.getCollection();
      const { status, limit = 50, skip = 0 } = options;
      const query = {};
      if (status && status !== 'all') {
        query.status = status;
      }
      const refundRequests = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await collection.countDocuments(query);
      return { refundRequests, total };
    } catch (error) {
      console.error('Error getting all refund requests from MongoDB:', error);
      throw error;
    }
  }

  // Get refund request by payment intent ID
  async getRefundRequestByPaymentIntentId(paymentIntentId) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ 
        paymentIntentId: paymentIntentId,
        status: { $ne: 'rejected' } // Get active refund requests
      });
    } catch (error) {
      console.error('Error getting refund request from MongoDB:', error);
      throw error;
    }
  }

  // Get all refund requests for a user
  async getUserRefundRequests(userId, options = {}) {
    try {
      const collection = await this.getCollection();
      const { status, limit = 50, skip = 0 } = options;
      
      const query = { userId: userId };
      
      if (status) {
        query.status = status;
      }

      const refundRequests = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await collection.countDocuments(query);

      return {
        refundRequests,
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error getting user refund requests from MongoDB:', error);
      throw error;
    }
  }

  // Update refund request status
  async updateRefundStatus(refundRequestId, status, updateData = {}) {
    try {
      const collection = await this.getCollection();
      const updateFields = {
        status: status,
        updatedAt: new Date(),
        ...updateData,
      };

      // Set timestamps based on status
      if (status === 'processing') {
        updateFields.processedAt = new Date();
      } else if (status === 'completed') {
        updateFields.completedAt = new Date();
      }

      const result = await collection.updateOne(
        { _id: typeof refundRequestId === 'string' ? new ObjectId(refundRequestId) : refundRequestId },
        { $set: updateFields }
      );
      return result;
    } catch (error) {
      console.error('Error updating refund request status in MongoDB:', error);
      throw error;
    }
  }

  // Approve refund request
  async approveRefund(refundRequestId, stripeRefundId = null) {
    try {
      return await this.updateRefundStatus(refundRequestId, 'approved', {
        stripeRefundId: stripeRefundId,
      });
    } catch (error) {
      console.error('Error approving refund request in MongoDB:', error);
      throw error;
    }
  }

  // Reject refund request
  async rejectRefund(refundRequestId, rejectionReason) {
    try {
      return await this.updateRefundStatus(refundRequestId, 'rejected', {
        rejectionReason: rejectionReason,
      });
    } catch (error) {
      console.error('Error rejecting refund request in MongoDB:', error);
      throw error;
    }
  }

  // Complete refund request
  async completeRefund(refundRequestId, stripeRefundId) {
    try {
      return await this.updateRefundStatus(refundRequestId, 'completed', {
        stripeRefundId: stripeRefundId,
        completedAt: new Date(),
      });
    } catch (error) {
      console.error('Error completing refund request in MongoDB:', error);
      throw error;
    }
  }

  // Get refund request statistics for a user
  async getUserRefundStats(userId) {
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
      
      const totalRefunds = await collection.countDocuments({ userId: userId });
      const totalRefundedAmount = await collection.aggregate([
        { $match: { userId: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray();

      return {
        totalRefunds,
        totalRefundedAmount: totalRefundedAmount[0]?.total || 0,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            totalAmount: stat.totalAmount,
          };
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error('Error getting refund stats from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new RefundRequestModel();

