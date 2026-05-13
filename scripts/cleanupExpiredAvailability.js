// scripts/cleanupExpiredAvailability.js
require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const DoctorAvailability = require('../models/DoctorAvailabilityModel');
const DoctorAppointmentActivity = require('../models/DoctorAppointmentActivityModel');
const connectDB = require('../config/db');

/**
 * Cleanup expired availability entries and log to Doctor_AppointmentActivity
 */
async function cleanupExpiredAvailability() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    console.log(`🔍 Looking for expired availability entries (date + time < now)...`);

    // Helper function to parse time string to minutes
    const parseTimeToMinutes = (timeStr) => {
      if (!timeStr) return null;
      const cleaned = timeStr.replace(/\./g, ':').trim();
      const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return null;
      
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const amPm = match[3].toUpperCase();
      
      if (amPm === 'PM' && hours !== 12) hours += 12;
      if (amPm === 'AM' && hours === 12) hours = 0;
      
      return hours * 60 + minutes;
    };

    // Helper function to check if schedule is expired
    const isScheduleExpired = (availability) => {
      const scheduleDate = new Date(availability.date + 'T00:00:00');
      
      // If schedule date is more than 1 day in the future, it's not expired
      const daysDiff = Math.floor((scheduleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 1) return false;
      
      // If schedule date is today or in the past, check the latest time slot
      if (availability.timeSlots && availability.timeSlots.length > 0) {
        let latestTimeMinutes = -1;
        for (const slot of availability.timeSlots) {
          const slotMinutes = parseTimeToMinutes(slot.time);
          if (slotMinutes !== null && slotMinutes > latestTimeMinutes) {
            latestTimeMinutes = slotMinutes;
          }
        }
        
        if (latestTimeMinutes >= 0) {
          const scheduleDateTime = new Date(availability.date + 'T00:00:00');
          const hours = Math.floor(latestTimeMinutes / 60);
          const minutes = latestTimeMinutes % 60;
          scheduleDateTime.setHours(hours, minutes, 0, 0);
          
          return now > scheduleDateTime;
        }
      }
      
      // If no time slots, check if date has passed (end of day)
      scheduleDate.setHours(23, 59, 59, 999);
      return now > scheduleDate;
    };

    // Get all availabilities and filter by datetime
    const allAvailabilities = await DoctorAvailability.find({});
    const expiredEntries = allAvailabilities.filter(av => isScheduleExpired(av));

    if (expiredEntries.length === 0) {
      console.log('✅ No expired availability entries to delete');
      return { deleted: 0, entries: [] };
    }

    console.log(`📋 Found ${expiredEntries.length} expired entries`);

    // Log each entry to Doctor_AppointmentActivity before deleting
    const activityLogs = [];
    for (const entry of expiredEntries) {
      try {
        const activityLog = await DoctorAppointmentActivity.create({
          doctorId: entry.doctorId,
          date: entry.date,
          totalSlots: entry.totalSlots,
          bookedSlots: entry.bookedSlots,
          availableSlots: entry.availableSlots,
          action: 'expired',
          notes: `Availability entry expired and deleted on ${todayStr}`,
        });
        activityLogs.push(activityLog);
        console.log(`📝 Logged activity for doctor ${entry.doctorId}, date ${entry.date}`);
      } catch (error) {
        console.error(`❌ Error logging activity for entry ${entry._id}:`, error);
      }
    }

    // Delete expired entries by their IDs
    const expiredIds = expiredEntries.map(e => e._id);
    const deleteResult = expiredIds.length > 0 
      ? await DoctorAvailability.deleteMany({ _id: { $in: expiredIds } })
      : { deletedCount: 0 };

    console.log(`✅ Deleted ${deleteResult.deletedCount} expired availability entries`);
    console.log(`✅ Logged ${activityLogs.length} activities to Doctor_AppointmentActivity`);

    return {
      deleted: deleteResult.deletedCount,
      logged: activityLogs.length,
      entries: expiredEntries.map(e => ({
        _id: e._id.toString(),
        doctorId: e.doctorId,
        date: e.date,
        totalSlots: e.totalSlots,
        bookedSlots: e.bookedSlots,
      }))
    };
  } catch (error) {
    console.error('❌ Error in cleanup:', error);
    throw error;
  } finally {
    // Close database connection only when this script is run directly.
    // When used via the main server (cron jobs), the shared Mongoose
    // connection should remain open for other scheduled tasks.
    if (require.main === module) {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  cleanupExpiredAvailability()
    .then((result) => {
      console.log('✅ Cleanup completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = cleanupExpiredAvailability;

