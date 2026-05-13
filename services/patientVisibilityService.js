// services/patientVisibilityService.js
const mongoose = require('mongoose');
const DocAppointment = require('../models/DoctorAppointmentModel');
const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
const { 
  filterValidFutureAppointments, 
  buildValidFutureAppointmentsQuery,
  isCancelledStatus
} = require('./appointmentFilterService');

/**
 * Normalize date to UTC day boundary (start of day)
 * @param {Date} date - The date to normalize
 * @returns {Date} - Date normalized to start of day in UTC
 */
const normalizeToUTCDay = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/**
 * Check if a date has passed (end of day in UTC)
 * @param {Date} date - The date to check
 * @returns {boolean} - True if date has passed
 */
const hasDatePassed = (date) => {
  if (!date) return false;
  const today = normalizeToUTCDay(new Date());
  const checkDate = normalizeToUTCDay(date);
  return today > checkDate;
};

/**
 * Compute the next appointment date for a doctor-patient pair
 * Uses global filter to exclude cancelled appointments
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @param {string|ObjectId} excludedAppointmentId - Optional appointment ID to exclude from calculation
 * @returns {Promise<Date|null>} - The next appointment date, or null if no future appointments
 */
const computeNextAppointmentDate = async (doctorId, patientId, excludedAppointmentId = null) => {
  try {
    const now = new Date();
    
    // Build query using global helper (excludes cancelled)
    const baseQuery = {
      doctorId: new mongoose.Types.ObjectId(doctorId),
      patientId: new mongoose.Types.ObjectId(patientId)
    };
    
    if (excludedAppointmentId) {
      baseQuery._id = { $ne: new mongoose.Types.ObjectId(excludedAppointmentId) };
    }
    
    const appointmentQuery = buildValidFutureAppointmentsQuery(baseQuery, now);
    
    // Get the earliest future appointment
    const nextAppointment = await DocAppointment.findOne(appointmentQuery)
      .sort({ appointmentDate: 1 }) // Earliest first
      .lean();
    
    if (nextAppointment && nextAppointment.appointmentDate) {
      const aptDate = new Date(nextAppointment.appointmentDate);
      // Double-check it's valid and not cancelled
      if (!isNaN(aptDate.getTime()) && aptDate > now && !isCancelledStatus(nextAppointment.status)) {
        return aptDate;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error computing next appointment date:', error);
    throw error;
  }
};

/**
 * Compute the last visible date for a doctor-patient pair after cancellation
 * Handles all 4 visibility cases:
 * Case A: First ever appointment canceled → return null (remove patient)
 * Case B: Past appointments exist, follow-up/upcoming canceled → return most recent past appointment date
 * Case C: Multiple future appointments, one canceled → return next remaining future appointment date
 * Case D: Cancel then rebook → visibility restored based on new appointments
 * 
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @param {string|ObjectId} canceledAppointmentId - The canceled appointment ID (to exclude from calculation)
 * @returns {Promise<Date|null>} - The last visible date, or null if no appointments remain
 */
const computeLastVisibleDate = async (doctorId, patientId, canceledAppointmentId = null) => {
  try {
    const now = new Date();
    
    // Find all remaining appointments (excluding the canceled one)
    const appointmentQuery = {
      doctorId: new mongoose.Types.ObjectId(doctorId),
      patientId: new mongoose.Types.ObjectId(patientId),
      status: { $ne: 'canceled' } // Exclude canceled appointments
    };
    
    if (canceledAppointmentId) {
      appointmentQuery._id = { $ne: new mongoose.Types.ObjectId(canceledAppointmentId) };
    }
    
    // Get all remaining appointments (sorted by date ascending)
    const remainingAppointments = await DocAppointment.find(appointmentQuery)
      .sort({ appointmentDate: 1 })
      .lean();
    
    // Case A: No remaining appointments - patient should be removed
    if (remainingAppointments.length === 0) {
      return null;
    }
    
    // Separate future and past appointments
    // For future: use global filter to exclude cancelled appointments
    const futureAppointments = filterValidFutureAppointments(remainingAppointments, now);
    
    // For past: include completed appointments
    const pastAppointments = remainingAppointments.filter(apt => {
      const aptDate = new Date(apt.appointmentDate);
      return aptDate < now && apt.status === 'completed';
    });
    
    // Case C: If any future appointments exist, use the date of the nearest future appointment
    if (futureAppointments.length > 0) {
      const nearestFuture = futureAppointments[0]; // Already sorted ascending
      return normalizeToUTCDay(nearestFuture.appointmentDate);
    }
    
    // Case B: If any past completed appointments exist, use the date of the most recent past appointment
    if (pastAppointments.length > 0) {
      // Sort past appointments descending to get most recent
      const sortedPast = pastAppointments.sort((a, b) => 
        new Date(b.appointmentDate) - new Date(a.appointmentDate)
      );
      const mostRecentPast = sortedPast[0];
      return normalizeToUTCDay(mostRecentPast.appointmentDate);
    }
    
    // No valid appointments found (shouldn't happen given the check above, but handle it)
    return null;
  } catch (error) {
    console.error('Error computing last visible date:', error);
    throw error;
  }
};

/**
 * Update doctor-patient visibility mapping after appointment cancellation
 * This should be called within a transaction
 * Also updates patient's nextAppointment field
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @param {string|ObjectId} canceledAppointmentId - The canceled appointment ID
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @returns {Promise<{isRemoved: boolean, lastVisibleDate: Date|null, nextAppointmentDate: Date|null}>} - The visibility update result
 */
const updateVisibilityAfterCancellation = async (doctorId, patientId, canceledAppointmentId, session = null) => {
  try {
    const Patient = require('../models/PatientModel');
    
    // Compute visibility and next appointment in parallel
    const [lastVisibleDate, nextAppointmentDate] = await Promise.all([
      computeLastVisibleDate(doctorId, patientId, canceledAppointmentId),
      computeNextAppointmentDate(doctorId, patientId, canceledAppointmentId)
    ]);
    
    const updateData = {
      lastUpdatedBy: 'cancellation',
      lastUpdatedReason: `Appointment ${canceledAppointmentId} was canceled`
    };
    
    // Build options - only include session if provided and transactions are supported
    const options = { upsert: true, new: true };
    if (session) {
      options.session = session;
    }
    
    // Update patient's nextAppointment field
    const patientUpdateOptions = session ? { session } : {};
    try {
      await Patient.findByIdAndUpdate(
        patientId,
        { nextAppointment: nextAppointmentDate },
        patientUpdateOptions
      );
      console.log(`   ✅ Updated patient ${patientId} nextAppointment to ${nextAppointmentDate ? nextAppointmentDate.toISOString() : 'null'}`);
    } catch (patientUpdateError) {
      console.error(`   ⚠️ Error updating patient nextAppointment:`, patientUpdateError);
      // Don't throw - continue with visibility update
    }
    
    if (lastVisibleDate === null) {
      // No remaining appointments - mark as removed
      updateData.isRemoved = true;
      updateData.lastVisibleDate = null;
      
      try {
        await DoctorPatientMapping.findOneAndUpdate(
          { doctorId, patientId },
          updateData,
          options
        );
      } catch (txError) {
        // If transaction fails (e.g., no replica set), retry without session
        if (txError.code === 20 && session) {
          console.log(`   ⚠️ Transaction not supported, falling back to non-transactional update`);
          await DoctorPatientMapping.findOneAndUpdate(
            { doctorId, patientId },
            updateData,
            { upsert: true, new: true }
          );
        } else {
          throw txError;
        }
      }
      
      console.log(`   ✅ Patient ${patientId} removed from doctor ${doctorId} view (no remaining appointments)`);
      
      return { isRemoved: true, lastVisibleDate: null, nextAppointmentDate: null };
    } else {
      // Set last visible date
      updateData.isRemoved = false;
      updateData.lastVisibleDate = lastVisibleDate;
      
      try {
        await DoctorPatientMapping.findOneAndUpdate(
          { doctorId, patientId },
          updateData,
          options
        );
      } catch (txError) {
        // If transaction fails (e.g., no replica set), retry without session
        if (txError.code === 20 && session) {
          console.log(`   ⚠️ Transaction not supported, falling back to non-transactional update`);
          await DoctorPatientMapping.findOneAndUpdate(
            { doctorId, patientId },
            updateData,
            { upsert: true, new: true }
          );
        } else {
          throw txError;
        }
      }
      
      console.log(`   ✅ Patient ${patientId} visibility updated for doctor ${doctorId}: visible until ${lastVisibleDate.toISOString().split('T')[0]}`);
      
      return { isRemoved: false, lastVisibleDate, nextAppointmentDate };
    }
  } catch (error) {
    console.error('Error updating visibility after cancellation:', error);
    throw error;
  }
};

/**
 * Update visibility when appointment is rebooked/created
 * This should be called within a transaction
 * Also updates patient's nextAppointment field
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @param {string|ObjectId} appointmentId - The appointment ID (optional, for audit)
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @returns {Promise<{isRemoved: boolean, lastVisibleDate: Date|null, nextAppointmentDate: Date|null}>} - The visibility update result
 */
const updateVisibilityAfterRebook = async (doctorId, patientId, appointmentId = null, session = null) => {
  try {
    const Patient = require('../models/PatientModel');
    
    // Compute visibility and next appointment in parallel
    const [lastVisibleDate, nextAppointmentDate] = await Promise.all([
      computeLastVisibleDate(doctorId, patientId, null),
      computeNextAppointmentDate(doctorId, patientId, null)
    ]);
    
    const updateData = {
      lastUpdatedBy: 'rebook',
      lastUpdatedReason: appointmentId ? `Appointment ${appointmentId} was created/rebooked` : 'Appointment was rebooked',
      isRemoved: false
    };
    
    if (lastVisibleDate === null) {
      // This shouldn't happen if appointment was just created, but handle it
      updateData.lastVisibleDate = null;
    } else {
      updateData.lastVisibleDate = lastVisibleDate;
    }
    
    // Build options - only include session if provided
    const options = { upsert: true, new: true };
    if (session) {
      options.session = session;
    }
    
    // Update patient's nextAppointment field
    const patientUpdateOptions = session ? { session } : {};
    try {
      await Patient.findByIdAndUpdate(
        patientId,
        { nextAppointment: nextAppointmentDate },
        patientUpdateOptions
      );
      console.log(`   ✅ Updated patient ${patientId} nextAppointment to ${nextAppointmentDate ? nextAppointmentDate.toISOString() : 'null'}`);
    } catch (patientUpdateError) {
      console.error(`   ⚠️ Error updating patient nextAppointment:`, patientUpdateError);
      // Don't throw - continue with visibility update
    }
    
    try {
      await DoctorPatientMapping.findOneAndUpdate(
        { doctorId, patientId },
        updateData,
        options
      );
    } catch (txError) {
      // If transaction fails (e.g., no replica set), retry without session
      if (txError.code === 20 && session) {
        console.log(`   ⚠️ Transaction not supported, falling back to non-transactional update`);
        await DoctorPatientMapping.findOneAndUpdate(
          { doctorId, patientId },
          updateData,
          { upsert: true, new: true }
        );
      } else {
        throw txError;
      }
    }
    
    console.log(`   ✅ Patient ${patientId} visibility restored/updated for doctor ${doctorId}: visible until ${lastVisibleDate ? lastVisibleDate.toISOString().split('T')[0] : 'indefinitely'}`);
    
    return { isRemoved: false, lastVisibleDate, nextAppointmentDate };
  } catch (error) {
    console.error('Error updating visibility after rebook:', error);
    throw error;
  }
};

/**
 * Check if a doctor can view a patient
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @returns {Promise<{canView: boolean, reason?: string, lastVisibleDate?: Date}>} - Visibility check result
 */
const checkPatientVisibility = async (doctorId, patientId) => {
  try {
    const mapping = await DoctorPatientMapping.findOne({ doctorId, patientId });
    
    // If no mapping exists, patient is fully visible (backward compatibility)
    if (!mapping) {
      return { canView: true };
    }
    
    // If explicitly removed, cannot view
    if (mapping.isRemoved) {
      return { 
        canView: false, 
        reason: 'Patient has been removed from your view',
        lastVisibleDate: null
      };
    }
    
    // If lastVisibleDate is set, check if it has passed
    if (mapping.lastVisibleDate) {
      const today = normalizeToUTCDay(new Date());
      const lastVisible = normalizeToUTCDay(mapping.lastVisibleDate);
      
      if (today > lastVisible) {
        return { 
          canView: false, 
          reason: 'Access denied — patient details are not available after the last shared appointment date.',
          lastVisibleDate: mapping.lastVisibleDate
        };
      }
      
      return { 
        canView: true, 
        lastVisibleDate: mapping.lastVisibleDate
      };
    }
    
    // No restriction - fully visible
    return { canView: true };
  } catch (error) {
    console.error('Error checking patient visibility:', error);
    // Fail open for backward compatibility
    return { canView: true };
  }
};

/**
 * Log access to patient data for compliance
 * @param {string|ObjectId} doctorId - The doctor ID
 * @param {string|ObjectId} patientId - The patient ID
 * @param {string} purpose - The purpose of access (view_profile, view_timeline, update_notes, issue_prescription, view_medical_record, other)
 * @param {Object} metadata - Additional metadata about the access
 */
const logAccess = async (doctorId, patientId, purpose, metadata = {}) => {
  try {
    const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
    
    await DoctorPatientMapping.findOneAndUpdate(
      { doctorId, patientId },
      {
        $push: {
          accessLog: {
            timestamp: new Date(),
            purpose,
            metadata
          }
        }
      },
      { upsert: true, new: true }
    );
    
    console.log(`   📋 Access logged: doctorId=${doctorId}, patientId=${patientId}, purpose=${purpose}`);
  } catch (error) {
    console.error('Error logging access:', error);
    // Don't throw - access logging should not break the main flow
  }
};

module.exports = {
  computeLastVisibleDate,
  computeNextAppointmentDate,
  updateVisibilityAfterCancellation,
  updateVisibilityAfterRebook,
  checkPatientVisibility,
  normalizeToUTCDay,
  hasDatePassed,
  logAccess
};

