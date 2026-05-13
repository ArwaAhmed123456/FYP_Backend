const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// MongoDB connection string
// Use environment variables or fallback to Atlas MongoDB
const MONGO_URI = process.env.MONGO_URI;
const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';

let client = null;
let database = null;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    if (client) {
      return { client, database };
    }

    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 30000, // Increase to 30 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 30000, // Connection timeout
    });

    await client.connect();
    
    // Test the connection
    await client.db('admin').command({ ping: 1 });
    
    database = client.db(DATABASE_NAME);
    
    console.log('✅ Successfully connected to MongoDB!');
    console.log(`📊 Database: ${DATABASE_NAME}`);
    
    return { client, database };
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

// Get database instance
async function getDatabase() {
  if (!database) {
    await connectToMongoDB();
  }
  return database;
}

// Get collection
async function getCollection(collectionName) {
  const db = await getDatabase();
  return db.collection(collectionName);
}

// Test MongoDB connection
async function testConnection() {
  try {
    const { client } = await connectToMongoDB();
    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connection test successful!');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error.message);
    return false;
  }
}

// Close connection
async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    database = null;
    console.log('🔌 MongoDB connection closed');
  }
}

// Health check
async function healthCheck() {
  try {
    const { client } = await connectToMongoDB();
    await client.db('admin').command({ ping: 1 });
    return { status: 'healthy', database: DATABASE_NAME };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

module.exports = {
  connectToMongoDB,
  getDatabase,
  getCollection,
  testConnection,
  closeConnection,
  healthCheck
};
