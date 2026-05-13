// services/prescriptionExpiryService.js
// Nightly job to automatically expire and archive prescriptions

const mongoose = require('mongoose');
const PatientPrescription = require("../models/PatientPrescriptionModel");
const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");

/**
 * Run the prescription expiry job
 * Should be called daily (e.g., via cron or scheduler)
 */
const runPrescriptionExpiryJob = async () => {
  if (mongoose.connection.readyState !== 1) {
    return; // Skip when MongoDB (Mongoose) is not connected
  }
  try {
    console.log('🔄 [PRESCRIPTION_EXPIRY] Starting prescription expiry job...');
    const now = new Date();
    
    // Find all active prescriptions that have passed their end date
    const expiredPrescriptions = await PatientPrescription.find({
      isActive: true,
      isDeleted: false,
      endDate: { $lt: now }
    }).lean();
    
    console.log(`📋 [PRESCRIPTION_EXPIRY] Found ${expiredPrescriptions.length} expired prescriptions`);
    
    let deactivatedCount = 0;
    
    for (const prescription of expiredPrescriptions) {
      try {
        // Update prescription to inactive
        await PatientPrescription.updateOne(
          { _id: prescription._id },
          { 
            $set: { 
              isActive: false 
            } 
          }
        );
        
        // Log activity
        try {
          await PatientAppointmentActivity.create({
            doctorId: prescription.doctorId.toString(),
            patientId: prescription.patientId.toString(),
            appointmentId: prescription.appointmentId?.toString(),
            activityType: "prescription_completed",
            description: `Prescription completed: ${prescription.medicationName} (expired on ${new Date(prescription.endDate).toLocaleDateString()})`,
            metadata: {
              prescriptionId: prescription._id.toString(),
              medicationName: prescription.medicationName,
              endDate: prescription.endDate
            }
          });
        } catch (activityError) {
          console.error(`⚠️ [PRESCRIPTION_EXPIRY] Error logging activity for prescription ${prescription._id}:`, activityError);
        }
        
        deactivatedCount++;
      } catch (updateError) {
        console.error(`❌ [PRESCRIPTION_EXPIRY] Error deactivating prescription ${prescription._id}:`, updateError);
      }
    }
    
    console.log(`✅ [PRESCRIPTION_EXPIRY] Job completed. Deactivated ${deactivatedCount} prescriptions.`);
    
    return {
      success: true,
      expiredCount: expiredPrescriptions.length,
      deactivatedCount: deactivatedCount
    };
  } catch (error) {
    console.error('❌ [PRESCRIPTION_EXPIRY] Error running expiry job:', error);
    throw error;
  }
};

/**
 * Schedule the job to run daily at midnight
 * This should be called from server.js or a scheduler service
 */
const schedulePrescriptionExpiry = () => {
  // Run immediately on startup (for testing)
  runPrescriptionExpiryJob().catch(err => {
    console.error('Error running initial prescription expiry check:', err);
  });
  
  // Schedule to run daily at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    // Run daily
    setInterval(() => {
      runPrescriptionExpiryJob().catch(err => {
        console.error('Error running scheduled prescription expiry:', err);
      });
    }, 24 * 60 * 60 * 1000); // 24 hours
    
    // Run immediately
    runPrescriptionExpiryJob().catch(err => {
      console.error('Error running scheduled prescription expiry:', err);
    });
  }, msUntilMidnight);
  
  console.log('📅 [PRESCRIPTION_EXPIRY] Scheduled daily prescription expiry job');
};

module.exports = {
  runPrescriptionExpiryJob,
  schedulePrescriptionExpiry
};

