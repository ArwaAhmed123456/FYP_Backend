const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// Health Tip model for MongoDB - Patient Dashboard Tips
class HealthTipModel {
  constructor() {
    this.collectionName = 'Patient Dashboard Tips';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new health tip
  async createHealthTip(tipData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        tip: tipData.tip,
        tipUrdu: tipData.tipUrdu || null,
        category: tipData.category || 'general',
        priority: tipData.priority || 'medium',
        isActive: tipData.isActive !== undefined ? tipData.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return result;
    } catch (error) {
      console.error('Error creating health tip in MongoDB:', error);
      throw error;
    }
  }

  // Create multiple health tips
  async createMultipleHealthTips(tipsArray) {
    try {
      const collection = await this.getCollection();
      const tipsWithTimestamps = tipsArray.map(tip => ({
        tip: tip.tip,
        tipUrdu: tip.tipUrdu || null,
        category: tip.category || 'general',
        priority: tip.priority || 'medium',
        isActive: tip.isActive !== undefined ? tip.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      const result = await collection.insertMany(tipsWithTimestamps);
      return result;
    } catch (error) {
      console.error('Error creating multiple health tips in MongoDB:', error);
      throw error;
    }
  }

  // Get health tip of the day (random active tip)
  async getHealthTipOfTheDay() {
    try {
      const collection = await this.getCollection();
      const pipeline = [
        { $match: { isActive: true } },
        { $sample: { size: 1 } }
      ];
      
      const result = await collection.aggregate(pipeline).toArray();
      return result[0] || null;
    } catch (error) {
      console.error('Error getting health tip of the day from MongoDB:', error);
      throw error;
    }
  }

  // Get health tips by category
  async getHealthTipsByCategory(category, limit = 10) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ 
        category: category,
        isActive: true 
      })
      .limit(limit)
      .toArray();
    } catch (error) {
      console.error('Error getting health tips by category from MongoDB:', error);
      throw error;
    }
  }

  // Get all health tips with pagination
  async getAllHealthTips(skip = 0, limit = 50) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ isActive: true })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error getting all health tips from MongoDB:', error);
      throw error;
    }
  }

  // Update health tip
  async updateHealthTip(tipId, updateData) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof tipId === 'string' ? new ObjectId(tipId) : tipId;
      const result = await collection.updateOne(
        { _id: objectId },
        { 
          $set: {
            ...updateData,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error updating health tip in MongoDB:', error);
      throw error;
    }
  }

  // Delete health tip (soft delete)
  async deleteHealthTip(tipId) {
    try {
      const collection = await this.getCollection();
      const objectId = typeof tipId === 'string' ? new ObjectId(tipId) : tipId;
      const result = await collection.updateOne(
        { _id: objectId },
        { 
          $set: {
            isActive: false,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error deleting health tip in MongoDB:', error);
      throw error;
    }
  }

  // Get health tips count
  async getHealthTipsCount() {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments({ isActive: true });
    } catch (error) {
      console.error('Error getting health tips count from MongoDB:', error);
      throw error;
    }
  }

  // Search health tips
  async searchHealthTips(query, limit = 20) {
    try {
      const collection = await this.getCollection();
      const searchQuery = {
        $or: [
          { tip: { $regex: query, $options: 'i' } },
          { tipUrdu: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } }
        ],
        isActive: true
      };
      
      return await collection.find(searchQuery)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
    } catch (error) {
      console.error('Error searching health tips in MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new HealthTipModel();
