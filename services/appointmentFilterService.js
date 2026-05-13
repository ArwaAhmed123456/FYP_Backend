// services/appointmentFilterService.js
// Global helper functions for filtering appointments consistently across the application

/**
 * List of cancelled status variations that should be excluded from active/future appointments
 */
const CANCELLED_STATUSES = [
  'cancelled',
  'canceled',
  'doctor_cancelled',
  'patient_cancelled',
  'removed'
];

/**
 * Check if an appointment status is considered cancelled
 * @param {string} status - The appointment status
 * @returns {boolean} - True if status is cancelled
 */
const isCancelledStatus = (status) => {
  if (!status) return false;
  return CANCELLED_STATUSES.includes(status.toLowerCase());
};

/**
 * Filter valid future appointments (excludes cancelled and past appointments)
 * This is the GLOBAL standard for all appointment filtering
 * 
 * @param {Array} appointments - Array of appointment objects
 * @param {Date} now - Current date/time (defaults to new Date())
 * @returns {Array} - Filtered and sorted appointments (earliest first)
 */
const filterValidFutureAppointments = (appointments, now = null) => {
  if (!Array.isArray(appointments)) {
    console.warn('⚠️ [APPT_FILTER] filterValidFutureAppointments received non-array:', typeof appointments);
    return [];
  }
  
  const currentTime = now || new Date();
  
  const validAppointments = appointments
    .filter(apt => {
      if (!apt) return false;
      
      // Must have appointmentDate
      if (!apt.appointmentDate) {
        return false;
      }
      
      // Must be in the future
      const aptDate = new Date(apt.appointmentDate);
      if (isNaN(aptDate.getTime())) {
        return false;
      }
      
      if (aptDate <= currentTime) {
        return false; // Past appointment
      }
      
      // Must NOT be cancelled
      if (isCancelledStatus(apt.status)) {
        return false; // Cancelled appointment
      }
      
      // Must have active status
      const activeStatuses = ['upcoming', 'pending_reschedule'];
      if (!activeStatuses.includes(apt.status?.toLowerCase())) {
        return false; // Not an active status
      }
      
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.appointmentDate);
      const dateB = new Date(b.appointmentDate);
      return dateA.getTime() - dateB.getTime(); // Ascending (earliest first)
    });
  
  return validAppointments;
};

/**
 * Get the next appointment from an array of appointments
 * Uses filterValidFutureAppointments and returns the first (earliest) one
 * 
 * @param {Array} appointments - Array of appointment objects
 * @param {Date} now - Current date/time (defaults to new Date())
 * @returns {Object|null} - The next appointment or null
 */
const getNextAppointment = (appointments, now = null) => {
  const validAppointments = filterValidFutureAppointments(appointments, now);
  return validAppointments.length > 0 ? validAppointments[0] : null;
};

/**
 * Get the next appointment date from an array of appointments
 * 
 * @param {Array} appointments - Array of appointment objects
 * @param {Date} now - Current date/time (defaults to new Date())
 * @returns {Date|null} - The next appointment date or null
 */
const getNextAppointmentDate = (appointments, now = null) => {
  const nextAppt = getNextAppointment(appointments, now);
  if (!nextAppt || !nextAppt.appointmentDate) {
    return null;
  }
  
  const date = new Date(nextAppt.appointmentDate);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * MongoDB query helper: Build query for valid future appointments
 * Use this in all MongoDB queries that need future active appointments
 * 
 * @param {Object} baseQuery - Base MongoDB query (e.g., { doctorId, patientId })
 * @param {Date} now - Current date/time (defaults to new Date())
 * @returns {Object} - MongoDB query object
 */
const buildValidFutureAppointmentsQuery = (baseQuery = {}, now = null) => {
  const currentTime = now || new Date();
  
  return {
    ...baseQuery,
    appointmentDate: { $gt: currentTime },
    status: { 
      $in: ['upcoming', 'pending_reschedule'],
      $nin: CANCELLED_STATUSES
    }
  };
};

/**
 * Debug helper: Log appointment filtering results
 * 
 * @param {Array} allAppointments - All appointments before filtering
 * @param {Array} filteredAppointments - Filtered appointments
 * @param {string} context - Context for logging (e.g., "patient_detail", "appointment_list")
 */
const logAppointmentFiltering = (allAppointments, filteredAppointments, context = 'unknown') => {
  const now = new Date();
  
  const futureActive = filteredAppointments || [];
  const futureCancelled = (allAppointments || []).filter(apt => {
    if (!apt.appointmentDate) return false;
    const aptDate = new Date(apt.appointmentDate);
    return aptDate > now && isCancelledStatus(apt.status);
  });
  const pastAppointments = (allAppointments || []).filter(apt => {
    if (!apt.appointmentDate) return false;
    const aptDate = new Date(apt.appointmentDate);
    return aptDate <= now;
  });
  
  const chosenNext = futureActive.length > 0 ? futureActive[0] : null;
  
  console.log(`📊 [APPT_FILTER:${context}] Appointment filtering results:`);
  console.log(`   Total appointments: ${(allAppointments || []).length}`);
  console.log(`   Future active: ${futureActive.length}`);
  console.log(`   Future cancelled: ${futureCancelled.length}`);
  console.log(`   Past appointments: ${pastAppointments.length}`);
  console.log(`   Chosen next appointment: ${chosenNext ? `${new Date(chosenNext.appointmentDate).toISOString()} (${chosenNext.status})` : 'null'}`);
  
  if (futureCancelled.length > 0) {
    console.log(`   ⚠️ Excluded cancelled appointments:`);
    futureCancelled.forEach(apt => {
      console.log(`      - ${new Date(apt.appointmentDate).toISOString()} (${apt.status})`);
    });
  }
};

module.exports = {
  CANCELLED_STATUSES,
  isCancelledStatus,
  filterValidFutureAppointments,
  getNextAppointment,
  getNextAppointmentDate,
  buildValidFutureAppointmentsQuery,
  logAppointmentFiltering
};

