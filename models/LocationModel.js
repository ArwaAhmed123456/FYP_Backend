const { getCollection } = require('./mongodb');

// Location model for MongoDB
class LocationModel {
  constructor() {
    this.collectionName = 'locations';
  }

  async getCollection() {
    return await getCollection(this.collectionName);
  }

  // Save location to database
  async saveLocation(locationData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.insertOne({
        ...locationData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return result;
    } catch (error) {
      console.error('Error saving location to MongoDB:', error);
      throw error;
    }
  }

  // Get location by ID
  async getLocationById(id) {
    try {
      const collection = await this.getCollection();
      return await collection.findOne({ id: id });
    } catch (error) {
      console.error('Error getting location from MongoDB:', error);
      throw error;
    }
  }

  // Search locations
  async searchLocations(query, userLat, userLon, radius = 25) {
    try {
      const collection = await this.getCollection();
      
      // Create a MongoDB query for location search
      const mongoQuery = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { address: { $regex: query, $options: 'i' } },
          { type: { $regex: query, $options: 'i' } }
        ]
      };

      const locations = await collection.find(mongoQuery).toArray();
      
      // Filter by distance if coordinates provided
      if (userLat && userLon) {
        return locations.filter(location => {
          if (!location.position || !location.position.lat || !location.position.lng) {
            return false;
          }
          
          const distance = this.calculateDistance(
            userLat, userLon,
            location.position.lat, location.position.lng
          );
          
          return distance <= radius;
        });
      }
      
      return locations;
    } catch (error) {
      console.error('Error searching locations in MongoDB:', error);
      throw error;
    }
  }

  // Get nearby locations
  async getNearbyLocations(lat, lon, radius = 25, limit = 50) {
    try {
      const collection = await this.getCollection();
      const locations = await collection.find({}).limit(limit * 2).toArray();
      
      // Calculate distances and filter
      const nearbyLocations = locations
        .map(location => {
          if (!location.position || !location.position.lat || !location.position.lng) {
            return null;
          }
          
          const distance = this.calculateDistance(
            lat, lon,
            location.position.lat, location.position.lng
          );
          
          if (distance <= radius) {
            return {
              ...location,
              distance: distance,
              distanceFormatted: `${distance.toFixed(1)} KM`
            };
          }
          
          return null;
        })
        .filter(location => location !== null)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
      
      return nearbyLocations;
    } catch (error) {
      console.error('Error getting nearby locations from MongoDB:', error);
      throw error;
    }
  }

  // Update location
  async updateLocation(id, updateData) {
    try {
      const collection = await this.getCollection();
      const result = await collection.updateOne(
        { id: id },
        { 
          $set: {
            ...updateData,
            updatedAt: new Date()
          }
        }
      );
      return result;
    } catch (error) {
      console.error('Error updating location in MongoDB:', error);
      throw error;
    }
  }

  // Delete location
  async deleteLocation(id) {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ id: id });
      return result;
    } catch (error) {
      console.error('Error deleting location from MongoDB:', error);
      throw error;
    }
  }

  // Calculate distance between two coordinates (in kilometers)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Get all locations count
  async getLocationsCount() {
    try {
      const collection = await this.getCollection();
      return await collection.countDocuments();
    } catch (error) {
      console.error('Error getting locations count from MongoDB:', error);
      throw error;
    }
  }
}

module.exports = new LocationModel();
