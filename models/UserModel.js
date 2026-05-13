const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

// User model for MongoDB - Patient profiles
class UserModel {
  constructor() {
    this.collectionName = 'Patient';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Create a new user
  async createUser(userData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        userRole: 'Patient',
        firstName: userData.firstName,
        lastName: userData.lastName,
        emailAddress: userData.emailAddress ? userData.emailAddress.toLowerCase() : '',
        phone: userData.phone,
        password: userData.password,
        profileImage: userData.profileImage || '',
        gender: userData.gender || '',
        Age: userData.Age || '',
        address: userData.address || {},
        isActive: 'true',
        createdBy: null,
        lastVisit: new Date(),
        nextAppointment: userData.nextAppointment || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      });
      return result;
    } catch (error) {
      console.error('Error creating user in MongoDB:', error);
      throw error;
    }
  }

  // Get user by ID
  async getUserById(userId) {
    try {
      const collection = await this.getCollection();
      // Convert string ID to ObjectId if needed
      const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      return await collection.findOne({ _id: objectId });
    } catch (error) {
      console.error('Error getting user from MongoDB:', error);
      throw error;
    }
  }

  // Get user by email
  async getUserByEmail(email) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ emailAddress: email.toLowerCase() });
    } catch (error) {
      console.error('Error getting user by email from MongoDB:', error);
      throw error;
    }
  }

  // Get user by phone
  async getUserByPhone(phone) {
    try {
      const collection = await this.getCollection();
      
      // Normalize the input phone number
      const normalizedPhone = phone.replace(/\D/g, '');
      
      // Try to find user with different phone number formats
      const user = await collection.findOne({
        $or: [
          { phone: phone }, // Exact match
          { phone: { $regex: normalizedPhone, $options: 'i' } }, // Contains the digits
          { phone: { $regex: `\\+${normalizedPhone}`, $options: 'i' } }, // With + prefix
          { phone: { $regex: `\\+${normalizedPhone.slice(0, 2)}-${normalizedPhone.slice(2, 5)}-${normalizedPhone.slice(5)}`, $options: 'i' } }, // With dashes
          { phone: { $regex: `\\+${normalizedPhone.slice(0, 2)} ${normalizedPhone.slice(2, 5)} ${normalizedPhone.slice(5)}`, $options: 'i' } } // With spaces
        ]
      });
      
      console.log('Phone lookup:', { input: phone, normalized: normalizedPhone, found: !!user });
      return user;
    } catch (error) {
      console.error('Error getting user by phone from MongoDB:', error);
      throw error;
    }
  }

  // Check if email already exists
  async emailExists(email) {
    try {
      // Don't check for empty or null emails
      if (!email || !email.trim()) {
        return false;
      }
      
      const collection = await this.getCollection();
      const user = await collection.findOne({ 
        emailAddress: email.toLowerCase(),
        isActive: 'true' 
      });
      return !!user;
    } catch (error) {
      console.error('Error checking email existence:', error);
      throw error;
    }
  }

  // Check if phone number already exists
  async phoneExists(phone) {
    try {
      // Don't check for empty or null phones
      if (!phone || !phone.trim()) {
        return false;
      }
      
      const collection = await this.getCollection();
      const user = await collection.findOne({ 
        phone: phone,
        isActive: 'true' 
      });
      return !!user;
    } catch (error) {
      console.error('Error checking phone existence:', error);
      throw error;
    }
  }

  // Update user profile
  async updateUser(userId, updateData) {
    try {
      const collection = await this.getCollection();
      // Convert string ID to ObjectId if needed
      const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
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
      console.error('Error updating user in MongoDB:', error);
      throw error;
    }
  }

  // Update user password
  async updatePassword(userId, hashedPassword) {
    try {
      console.log('UserModel.updatePassword called with:', { 
        userId, 
        hashedPasswordLength: hashedPassword.length,
        hashedPasswordPrefix: hashedPassword.substring(0, 20) + '...'
      });
      
      const collection = await this.getCollection();
      // Convert string ID to ObjectId if needed
      const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      
      console.log('Updating password for ObjectId:', objectId);
      
      const result = await collection.updateOne(
        { _id: objectId },
        { 
          $set: {
            password: hashedPassword,
            updatedAt: new Date()
          }
        }
      );
      
      console.log('MongoDB update result:', { 
        matchedCount: result.matchedCount, 
        modifiedCount: result.modifiedCount,
        acknowledged: result.acknowledged 
      });
      
      return result;
    } catch (error) {
      console.error('Error updating password in MongoDB:', error);
      throw error;
    }
  }

  // Delete user account
  async deleteUser(userId) {
    try {
      const collection = await this.getCollection();
      // Convert string ID to ObjectId if needed
      const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
      const result = await collection.updateOne(
        { _id: objectId },
        { 
          $set: {
            isActive: 'false',
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error deleting user in MongoDB:', error);
      throw error;
    }
  }

  // Get all users (for admin purposes)
  async getAllUsers(limit = 50, skip = 0) {
    try {
      const collection = await this.getCollection();
      return await collection.find({ isActive: 'true' })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Error getting all users from MongoDB:', error);
      throw error;
    }
  }

  // Search users
  async searchUsers(query) {
    try {
      const collection = await this.getCollection();
      const searchQuery = {
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { emailAddress: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } }
        ],
        isActive: 'true'
      };
      
      return await collection.find(searchQuery).toArray();
    } catch (error) {
      console.error('Error searching users in MongoDB:', error);
      throw error;
    }
  }

  // Get users count
  async getUsersCount() {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments({ isActive: 'true' });
    } catch (error) {
      console.error('Error getting users count from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new UserModel();
