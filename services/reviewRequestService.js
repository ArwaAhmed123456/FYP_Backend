/**
 * Post-appointment review request service (in-person appointments only).
 * Runs on a schedule (e.g. every 5 minutes); finds in-person appointments whose
 * scheduled end time has elapsed, sends one notification per appointment, and
 * marks reviewRequested so we never send again.
 * Timezone: uses server UTC; comparison is against appointment endTime (stored as Date).
 */

const DocAppointment = require('../models/DoctorAppointmentModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');

const DEFAULT_SLOT_DURATION_MINUTES = 30;

/**
 * Get effective end time for an appointment (stored endTime or appointmentDate + default duration).
 * @param {object} apt - raw appointment document
 * @returns {Date} end time in UTC
 */
function getAppointmentEndTime(apt) {
  if (apt.endTime && apt.endTime instanceof Date) {
    return new Date(apt.endTime);
  }
  const start = apt.appointmentDate ? new Date(apt.appointmentDate) : null;
  if (!start) return null;
  const end = new Date(start.getTime() + DEFAULT_SLOT_DURATION_MINUTES * 60 * 1000);
  return end;
}

/**
 * Run the review request job: find in-person appointments past end time with reviewRequested=false,
 * create notification and set reviewRequested=true, reviewNotifiedAt=now.
 * Only runs for type "In-Person" (no telehealth).
 */
async function runReviewRequestJob() {
  const now = new Date();
  const results = { processed: 0, errors: [] };

  try {
    // All in-person appointments that haven't had review requested yet
    const candidates = await DocAppointment.find({
      type: 'In-Person',
      reviewRequested: { $ne: true },
    })
      .populate('doctorId', 'DoctorName')
      .populate('patientId', 'firstName lastName')
      .lean();

    for (const apt of candidates) {
      const endTime = getAppointmentEndTime(apt);
      if (!endTime) continue;
      // Only trigger after scheduled end time has elapsed (timezone: stored dates are UTC)
      if (now <= endTime) continue;

      try {
        const appointmentId = apt._id.toString();
        const patientId = apt.patientId?._id?.toString() || apt.patientId?.toString();
        if (!patientId) {
          results.errors.push({ appointmentId, message: 'Missing patientId' });
          continue;
        }

        const doctorName = apt.doctorId?.DoctorName || 'Your doctor';

        await PatientNotificationModel.createNotification({
          patientId,
          type: 'review_request',
          title: 'Leave a review',
          description: 'Your appointment has ended. Please leave a review.',
          icon: 'star-outline',
          appointmentId,
          doctorName,
          actionRoute: `/submit-review/${appointmentId}`,
          timestamp: now,
        });

        await DocAppointment.updateOne(
          { _id: apt._id },
          {
            $set: {
              reviewRequested: true,
              reviewNotifiedAt: now,
            },
          }
        );

        results.processed += 1;
      } catch (err) {
        console.error('reviewRequestService: error processing appointment', apt._id, err);
        results.errors.push({ appointmentId: apt._id?.toString(), message: err.message });
      }
    }

    return results;
  } catch (err) {
    console.error('reviewRequestService: runReviewRequestJob failed', err);
    throw err;
  }
}

module.exports = {
  runReviewRequestJob,
  getAppointmentEndTime,
};
