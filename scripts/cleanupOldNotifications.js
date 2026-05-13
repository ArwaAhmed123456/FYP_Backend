// scripts/cleanupOldNotifications.js
require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const { getCollection } = require('../services/mongodb');
const DoctorAppointmentActivity = require('../models/DoctorAppointmentActivityModel');
const PatientAppointmentActivity = require('../models/PatientAppointmentActivityModel');
const connectDB = require('../config/db');

/**
 * Cleanup old notifications and appointment activity records
 * - Delete Doctor_Notifications older than 30 days
 * - Delete Patient_Notifications older than 30 days
 * - Delete Doctor_AppointmentActivity older than 60 days
 * - Delete Patient_AppointmentActivity older than 60 days
 * @param {boolean} closeConnection - Whether to close DB connection after cleanup (default: false)
 */
async function cleanupOldNotifications(closeConnection = false) {
  const wasAlreadyConnected = mongoose.connection.readyState !== 0;
  
  try {
    // Connect to database (only if not already connected)
    if (!wasAlreadyConnected) {
      await connectDB();
    }
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    
    // Calculate cutoff dates
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    console.log(`🔍 Cleaning up old records...`);
    console.log(`   - Notifications older than: ${thirtyDaysAgo.toISOString()}`);
    console.log(`   - Appointment Activity older than: ${sixtyDaysAgo.toISOString()}`);

    // Cleanup Doctor_Notifications (30 days)
    const doctorNotificationsCollection = await getCollection('Doctor_Notifications');
    const doctorNotificationsResult = await doctorNotificationsCollection.deleteMany({
      createdAt: { $lt: thirtyDaysAgo }
    });
    console.log(`✅ Deleted ${doctorNotificationsResult.deletedCount} doctor notification(s) older than 30 days`);

    // Cleanup Patient_Notifications (30 days)
    const patientNotificationsCollection = await getCollection('Patient_Notifications');
    const patientNotificationsResult = await patientNotificationsCollection.deleteMany({
      createdAt: { $lt: thirtyDaysAgo }
    });
    console.log(`✅ Deleted ${patientNotificationsResult.deletedCount} patient notification(s) older than 30 days`);

    // Cleanup Doctor_AppointmentActivity (60 days)
    const doctorActivityResult = await DoctorAppointmentActivity.deleteMany({
      createdAt: { $lt: sixtyDaysAgo }
    });
    console.log(`✅ Deleted ${doctorActivityResult.deletedCount} doctor appointment activity record(s) older than 60 days`);

    // Cleanup Patient_AppointmentActivity (60 days)
    const patientActivityResult = await PatientAppointmentActivity.deleteMany({
      createdAt: { $lt: sixtyDaysAgo }
    });
    console.log(`✅ Deleted ${patientActivityResult.deletedCount} patient appointment activity record(s) older than 60 days`);

    return {
      doctorNotificationsDeleted: doctorNotificationsResult.deletedCount,
      patientNotificationsDeleted: patientNotificationsResult.deletedCount,
      doctorActivityDeleted: doctorActivityResult.deletedCount,
      patientActivityDeleted: patientActivityResult.deletedCount,
      timestamp: now.toISOString()
    };
  } catch (error) {
    console.error('❌ Error in cleanup:', error);
    throw error;
  } finally {
    // Only close database connection if we opened it (when called directly)
    if (closeConnection && !wasAlreadyConnected && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  cleanupOldNotifications(true) // Close connection when called directly
    .then((result) => {
      console.log('✅ Cleanup completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = cleanupOldNotifications;

