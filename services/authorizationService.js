/**
 * Authorization Service
 * Checks if a user has permission to access sensitive data
 */

const { ObjectId } = require('mongoose').Types;

/**
 * Check if user is authorized to access appointment data
 * @param {Object} appointment - Appointment document
 * @param {string} userId - User ID requesting access
 * @param {string} userRole - User role ('doctor', 'patient', 'admin')
 * @returns {boolean} - True if authorized
 */
function canAccessAppointment(appointment, userId, userRole) {
  if (!appointment || !userId || !userRole) {
    return false;
  }

  // System admin can access everything
  if (userRole === 'admin' || userRole === 'system') {
    return true;
  }

  // Normalize IDs for comparison
  const appointmentDoctorId = appointment.doctorId?.toString() || appointment.doctorId;
  const appointmentPatientId = appointment.patientId?.toString() || appointment.patientId;
  const requestUserId = userId.toString();

  // Doctor can access if they are the assigned doctor
  if (userRole === 'doctor' && appointmentDoctorId === requestUserId) {
    return true;
  }

  // Patient can access if they are the assigned patient
  if (userRole === 'patient' && appointmentPatientId === requestUserId) {
    return true;
  }

  return false;
}

/**
 * Check if user is authorized to access medical record data
 * @param {Object} medicalRecord - Medical record document
 * @param {string} userId - User ID requesting access
 * @param {string} userRole - User role ('doctor', 'patient', 'admin')
 * @returns {boolean} - True if authorized
 */
function canAccessMedicalRecord(medicalRecord, userId, userRole) {
  if (!medicalRecord || !userId || !userRole) {
    return false;
  }

  // System admin can access everything
  if (userRole === 'admin' || userRole === 'system') {
    return true;
  }

  // Normalize IDs for comparison
  const recordPatientId = medicalRecord.patientId?.toString() || medicalRecord.patientId;
  const recordDoctorId = medicalRecord.doctorId?.toString() || medicalRecord.doctorId;
  const requestUserId = userId.toString();

  // Patient can access their own records
  if (userRole === 'patient' && recordPatientId === requestUserId) {
    return true;
  }

  // Doctor can access if they are the assigned doctor or if they created the record
  if (userRole === 'doctor' && recordDoctorId === requestUserId) {
    return true;
  }

  return false;
}

/**
 * Check if user is authorized to access call data
 * @param {Object} call - Call document
 * @param {string} userId - User ID requesting access
 * @param {string} userRole - User role ('doctor', 'patient', 'admin')
 * @returns {boolean} - True if authorized
 */
function canAccessCall(call, userId, userRole) {
  if (!call || !userId || !userRole) {
    return false;
  }

  // System admin can access everything
  if (userRole === 'admin' || userRole === 'system') {
    return true;
  }

  // Normalize IDs for comparison
  const callDoctorId = call.doctorId?.toString() || call.doctorId;
  const callPatientId = call.patientId?.toString() || call.patientId;
  const requestUserId = userId.toString();

  // Doctor can access if they are the assigned doctor
  if (userRole === 'doctor' && callDoctorId === requestUserId) {
    return true;
  }

  // Patient can access if they are the assigned patient
  if (userRole === 'patient' && callPatientId === requestUserId) {
    return true;
  }

  return false;
}

/**
 * Extract user info from request (supports multiple auth methods)
 * @param {Object} req - Express request object
 * @returns {Object} - { userId, userRole } or null
 */
function extractUserFromRequest(req) {
  // Try to get from query params
  if (req.query.userId && req.query.userRole) {
    return {
      userId: req.query.userId,
      userRole: req.query.userRole
    };
  }

  // Try to get from body
  if (req.body.userId && req.body.userRole) {
    return {
      userId: req.body.userId,
      userRole: req.body.userRole
    };
  }

  // Try to get from JWT token (if you have auth middleware)
  if (req.user) {
    return {
      userId: req.user.id || req.user._id,
      userRole: req.user.role
    };
  }

  // Try to get from headers
  if (req.headers['x-user-id'] && req.headers['x-user-role']) {
    return {
      userId: req.headers['x-user-id'],
      userRole: req.headers['x-user-role']
    };
  }

  return null;
}

module.exports = {
  canAccessAppointment,
  canAccessMedicalRecord,
  canAccessCall,
  extractUserFromRequest
};

