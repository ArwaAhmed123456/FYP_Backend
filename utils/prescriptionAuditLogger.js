/**
 * Utility to log prescription audit events to admin panel
 * This function should not throw errors - audit logging should not break the main flow
 */

const axios = require('axios');

/**
 * Sanitize prescription data for audit logging (remove sensitive/internal fields)
 * @param {Object} prescription - Prescription object (can be Mongoose document or plain object)
 * @returns {Object} Sanitized prescription
 */
const sanitizePrescription = (prescription) => {
  if (!prescription) return {};
  
  // Convert to plain object if it's a Mongoose document
  const prescObj = prescription.toObject ? prescription.toObject() : { ...prescription };
  
  // Remove sensitive/internal fields
  const sanitized = { ...prescObj };
  delete sanitized.__v;
  delete sanitized.password;
  
  // Convert ObjectIds to strings for JSON serialization
  if (sanitized._id) sanitized._id = sanitized._id.toString();
  if (sanitized.patientId) sanitized.patientId = sanitized.patientId.toString();
  if (sanitized.doctorId) sanitized.doctorId = sanitized.doctorId.toString();
  if (sanitized.appointmentId) sanitized.appointmentId = sanitized.appointmentId.toString();
  if (sanitized.previousVersionId) sanitized.previousVersionId = sanitized.previousVersionId.toString();
  
  return sanitized;
};

/**
 * Log prescription audit event to admin panel
 * @param {Object} params - Audit log parameters
 * @param {string} params.prescriptionId - Prescription ID
 * @param {string} params.eventType - Event type (CREATE, UPDATE, DELETE, SIGN, UNSIGN)
 * @param {string} params.changedBy - Doctor ID who made the change
 * @param {Object} params.before - Prescription state before change (optional)
 * @param {Object} params.after - Prescription state after change (optional)
 * @param {Object} params.req - Express request object (for IP/device)
 * @param {string} params.reason - Optional reason for change
 */
const logPrescriptionAudit = async ({
  prescriptionId,
  eventType,
  changedBy,
  before = null,
  after = null,
  req = null,
  reason = ""
}) => {
  try {
    // Only log if admin panel URL is configured
    const adminPanelUrl = process.env.ADMIN_PANEL_URL;
    const serviceKey = process.env.PRESCRIPTION_AUDIT_SERVICE_KEY;
    
    if (!adminPanelUrl || !serviceKey) {
      console.warn("⚠️ Prescription audit logging disabled: ADMIN_PANEL_URL or PRESCRIPTION_AUDIT_SERVICE_KEY not configured");
      return;
    }

    if (!prescriptionId || !eventType || !changedBy) {
      console.warn("⚠️ Prescription audit logging skipped: missing required parameters");
      return;
    }

    // Sanitize prescription data
    const sanitizedBefore = before ? sanitizePrescription(before) : {};
    const sanitizedAfter = after ? sanitizePrescription(after) : {};

    // Get IP and device from request
    const ip = req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for']?.split(',')[0] || '';
    const device = req?.headers?.['user-agent'] || '';

    const auditLogUrl = `${adminPanelUrl}/api/admin/prescription-log/log`;
    
    await axios.post(auditLogUrl, {
      prescriptionId: prescriptionId.toString(),
      eventType,
      changedBy: changedBy.toString(),
      changedByModel: 'Doctor',
      before: sanitizedBefore,
      after: sanitizedAfter,
      ip,
      device,
      reason
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': serviceKey
      },
      timeout: 5000 // 5 second timeout
    });

    console.log(`✅ Prescription audit logged: ${eventType} for prescription ${prescriptionId}`);
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    if (error.code === 'ECONNABORTED') {
      console.warn("⚠️ Prescription audit logging timeout");
    } else if (error.response) {
      console.error(`❌ Failed to log prescription audit: ${error.response.status} ${error.response.statusText}`);
    } else {
      console.error("❌ Error logging prescription audit:", error.message);
    }
  }
};

module.exports = {
  logPrescriptionAudit,
  sanitizePrescription
};

