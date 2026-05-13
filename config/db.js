// config/db.js - MongoDB connection for doctor backend
const mongoose = require('mongoose');
require('dotenv').config({ path: '../../.env' });

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';

    // Check if MONGO_URI is set
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not set in environment variables. Please check your .env file.');
    }

    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      console.log("✅ MongoDB already connected (Mongoose)");
      return;
    }

    // If MONGO_URI doesn't include database name, add it
    let connectionString = MONGO_URI;
    if (!MONGO_URI.includes('/') || MONGO_URI.split('/').length < 4) {
      // Connection string doesn't have database name, add it
      const separator = MONGO_URI.includes('?') ? '&' : '?';
      connectionString = `${MONGO_URI}${separator}dbName=${DATABASE_NAME}`;
    }

    // Add connection options for better reliability
    await mongoose.connect(connectionString, {
      dbName: DATABASE_NAME,
      serverSelectionTimeoutMS: 60000, // Increased to 60 seconds
      socketTimeoutMS: 60000,
      connectTimeoutMS: 60000,
      retryWrites: true,
      retryReads: true,
      // Removed family: 4 to allow default DNS resolution (IPv4/IPv6)
    });
    console.log("✅ MongoDB Connected (Doctor Backend - Mongoose)");
    console.log(`📊 Database: ${DATABASE_NAME}`);
  } catch (err) {
    // Don't exit process - let the server continue with native MongoDB connection
    console.error("❌ MongoDB Connection Failed (Mongoose):", err.message);
    // Log more details for debugging
    if (err.message.includes('querySrv')) {
      console.error("   💡 This is a DNS resolution error. Check your network connection and MongoDB Atlas SRV record.");
      console.error("   💡 The native MongoDB driver connection may still work.");
    }
    // Don't exit - allow server to continue with native MongoDB connection
    // process.exit(1); // Removed to allow graceful degradation
  }
};

module.exports = connectDB;

