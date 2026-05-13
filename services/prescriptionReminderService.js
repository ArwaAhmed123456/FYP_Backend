// services/prescriptionReminderService.js
// Background reminder service for medication reminders

const PatientPrescription = require("../models/PatientPrescriptionModel");
const PatientNotification = require("../models/PatientNotificationModel");
const mongoose = require("mongoose");

/**
 * Check and send medication reminders
 * Should be called periodically (e.g., every minute)
 */
const checkAndSendReminders = async () => {
  if (mongoose.connection.readyState !== 1) {
    return; // Skip when MongoDB (Mongoose) is not connected
  }
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    
    // Find all active prescriptions with reminders
    const activePrescriptions = await PatientPrescription.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
      reminders: { $exists: true, $ne: [] }
    }).populate('patientId', 'firstName lastName phone').lean();
    
    let remindersSent = 0;
    
    for (const prescription of activePrescriptions) {
      if (!prescription.reminders || prescription.reminders.length === 0) {
        continue;
      }
      
      for (const reminder of prescription.reminders) {
        // Check if reminder time matches current time (within 1 minute window)
        const reminderTime = reminder.time; // Format: "08:00"
        const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number);
        
        // Check if current time is within 1 minute of reminder time
        const timeDiff = Math.abs(
          (currentHour * 60 + currentMinute) - (reminderHour * 60 + reminderMinute)
        );
        
        if (timeDiff <= 1 && !reminder.taken && !reminder.skipped) {
          // Send reminder notification
          try {
            await sendReminderNotification(prescription, reminder);
            remindersSent++;
          } catch (notifError) {
            console.error(`Error sending reminder for prescription ${prescription._id}:`, notifError);
          }
        }
      }
    }
    
    if (remindersSent > 0) {
      console.log(`📱 [REMINDERS] Sent ${remindersSent} medication reminders`);
    }
    
    return { remindersSent };
  } catch (error) {
    console.error('❌ [REMINDERS] Error checking reminders:', error);
    throw error;
  }
};

/**
 * Send reminder notification to patient
 */
const sendReminderNotification = async (prescription, reminder) => {
  try {
    const patient = prescription.patientId;
    if (!patient || !patient._id) {
      return;
    }
    
    // Create notification
    const notification = new PatientNotification({
      patientId: patient._id,
      type: 'medication_reminder',
      title: 'Medication Reminder',
      message: `Time to take ${prescription.medicationName} (${prescription.dosage}) at ${reminder.time}`,
      data: {
        prescriptionId: prescription._id.toString(),
        medicationName: prescription.medicationName,
        dosage: prescription.dosage,
        frequency: prescription.frequency,
        reminderTime: reminder.time,
        reminderId: reminder._id?.toString() || null
      },
      read: false
    });
    
    await notification.save();
    
    // In production, also send push notification here
    // await sendPushNotification(patient, notification);
    
    console.log(`📱 [REMINDER] Sent reminder to patient ${patient._id} for ${prescription.medicationName} at ${reminder.time}`);
  } catch (error) {
    console.error('Error sending reminder notification:', error);
    throw error;
  }
};

/**
 * Mark reminder as taken
 */
const markReminderAsTaken = async (prescriptionId, reminderTime, patientId) => {
  try {
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(prescriptionId),
      patientId: new mongoose.Types.ObjectId(patientId),
      isDeleted: false
    });
    
    if (!prescription) {
      throw new Error('Prescription not found');
    }
    
    // Find and update reminder
    const reminder = prescription.reminders.find(r => r.time === reminderTime);
    if (reminder) {
      reminder.taken = true;
      reminder.takenAt = new Date();
      reminder.skipped = false;
      
      // Also log in adherence log
      if (!prescription.adherenceLog) {
        prescription.adherenceLog = [];
      }
      
      prescription.adherenceLog.push({
        date: new Date(),
        time: reminderTime,
        taken: true,
        timestamp: new Date()
      });
      
      await prescription.save();
      
      return { success: true, prescription };
    }
    
    throw new Error('Reminder not found');
  } catch (error) {
    console.error('Error marking reminder as taken:', error);
    throw error;
  }
};

/**
 * Mark reminder as skipped
 */
const markReminderAsSkipped = async (prescriptionId, reminderTime, patientId) => {
  try {
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(prescriptionId),
      patientId: new mongoose.Types.ObjectId(patientId),
      isDeleted: false
    });
    
    if (!prescription) {
      throw new Error('Prescription not found');
    }
    
    // Find and update reminder
    const reminder = prescription.reminders.find(r => r.time === reminderTime);
    if (reminder) {
      reminder.skipped = true;
      reminder.taken = false;
      
      // Also log in adherence log
      if (!prescription.adherenceLog) {
        prescription.adherenceLog = [];
      }
      
      prescription.adherenceLog.push({
        date: new Date(),
        time: reminderTime,
        taken: false,
        timestamp: new Date()
      });
      
      await prescription.save();
      
      return { success: true, prescription };
    }
    
    throw new Error('Reminder not found');
  } catch (error) {
    console.error('Error marking reminder as skipped:', error);
    throw error;
  }
};

/**
 * Get upcoming medication reminders for a patient
 */
const getUpcomingReminders = async (patientId, limit = 5) => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const activePrescriptions = await PatientPrescription.find({
      patientId: new mongoose.Types.ObjectId(patientId),
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
      reminders: { $exists: true, $ne: [] }
    }).lean();
    
    const upcomingReminders = [];
    
    for (const prescription of activePrescriptions) {
      if (!prescription.reminders) continue;
      
      for (const reminder of prescription.reminders) {
        if (reminder.taken || reminder.skipped) continue;
        
        const [reminderHour, reminderMinute] = reminder.time.split(':').map(Number);
        const reminderTimeMinutes = reminderHour * 60 + reminderMinute;
        const currentTimeMinutes = currentHour * 60 + currentMinute;
        
        // If reminder is today and in the future, or tomorrow
        let reminderDate = new Date(now);
        if (reminderTimeMinutes <= currentTimeMinutes) {
          // Reminder is for tomorrow
          reminderDate.setDate(reminderDate.getDate() + 1);
        }
        reminderDate.setHours(reminderHour, reminderMinute, 0, 0);
        
        const minutesUntilReminder = Math.floor((reminderDate.getTime() - now.getTime()) / (1000 * 60));
        
        if (minutesUntilReminder >= 0) {
          upcomingReminders.push({
            prescriptionId: prescription._id.toString(),
            medicationName: prescription.medicationName,
            dosage: prescription.dosage,
            frequency: prescription.frequency,
            reminderTime: reminder.time,
            minutesUntil: minutesUntilReminder,
            reminderDate: reminderDate.toISOString()
          });
        }
      }
    }
    
    // Sort by time until reminder
    upcomingReminders.sort((a, b) => a.minutesUntil - b.minutesUntil);
    
    return upcomingReminders.slice(0, limit);
  } catch (error) {
    console.error('Error getting upcoming reminders:', error);
    throw error;
  }
};

/**
 * Schedule reminder checks (runs every minute)
 */
const scheduleReminderChecks = () => {
  // Run immediately
  checkAndSendReminders().catch(err => {
    console.error('Error running initial reminder check:', err);
  });
  
  // Then run every minute
  setInterval(() => {
    checkAndSendReminders().catch(err => {
      console.error('Error running scheduled reminder check:', err);
    });
  }, 60 * 1000); // 1 minute
  
  console.log('⏰ [REMINDERS] Medication reminder service started (checks every minute)');
};

module.exports = {
  checkAndSendReminders,
  sendReminderNotification,
  markReminderAsTaken,
  markReminderAsSkipped,
  getUpcomingReminders,
  scheduleReminderChecks
};

