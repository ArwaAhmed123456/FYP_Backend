const mongoose = require('mongoose');
const DocPatientCallModel = require('../models/DocPatientCallModel');
const DocAppointment = require('../models/DoctorAppointmentModel');
const DoctorNotificationModel = require('../models/DoctorNotificationModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const streamRecordingService = require('./streamRecordingService');
const { getCollection } = require('./mongodb');
const { StreamChat } = require('stream-chat');

// Stream Video configuration
const STREAM_API_KEY = '9b9umg6sdvd7';
const STREAM_SECRET = 'eqhe4nxc4h66w4prhw2vn923k3cwy84ydjjdcza7svb9mbu6eq87fpu9rznvq6kc';
const streamClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_SECRET);

let io = null;

function setIO(socketIO) {
  io = socketIO;
}

/**
 * Generate Stream token for a user
 */
function generateStreamToken(userId, userName) {
  return streamClient.createToken(userId);
}

/**
 * Send reminder notification to doctor via Socket.io
 */
async function sendReminderNotification(doctorId, appointment, reminderType, minutes) {
  if (!io) return;

  // Get patient name
  let patientName = 'Patient';
  try {
    if (appointment.patientId) {
      const patientsCollection = await getCollection('Patient');
      const { ObjectId } = require('mongodb');
      const patientObjectId = ObjectId.isValid(appointment.patientId) 
        ? new ObjectId(appointment.patientId) 
        : null;
      if (patientObjectId) {
        const patient = await patientsCollection.findOne({ _id: patientObjectId });
        if (patient) {
          patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.emailAddress || 'Patient';
        }
      }
    }
  } catch (error) {
    console.error('Error getting patient name for reminder:', error);
  }

  const message = {
    type: 'consultation_reminder',
    reminderType,
    minutes,
    appointmentId: appointment._id.toString(),
    appointmentDate: appointment.appointmentDate || appointment.appointment_date,
    patientName,
    priority: 'high'
  };

  // Emit to doctor's socket
  io.emit(`DOCTOR_REMINDER_${doctorId}`, message);
  
  // Also create notification in database
  try {
    await DoctorNotificationModel.createNotification({
      doctorId: doctorId.toString(),
      type: 'consultation_reminder',
      title: `Consultation Reminder - ${minutes} minutes`,
      description: `Your consultation with ${appointment.patientInfo?.name || 'patient'} starts in ${minutes} minutes`,
      icon: 'alarm',
      appointmentId: appointment._id.toString(),
      patientName: appointment.patientInfo?.name,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error creating reminder notification:', error);
  }
}

/**
 * Create meeting room automatically
 */
async function createMeetingRoom(appointment) {
  try {
    const { _id, doctorId, patientId, appointmentDate, type } = appointment;
    
    // Check if call already exists
    const existingCall = await DocPatientCallModel.findOne({ appointmentId: _id.toString() });
    if (existingCall && existingCall.meetingRoomId) {
      return existingCall;
    }

    // Get doctor and patient names
    const patientsCollection = await getCollection('Patient');
    const doctorsCollection = await getCollection('Doctor');
    const { ObjectId } = require('mongodb');

    const patientObjectId = ObjectId.isValid(patientId) ? new ObjectId(patientId) : null;
    const doctorObjectId = ObjectId.isValid(doctorId) ? new ObjectId(doctorId) : null;

    const [patient, doctor] = await Promise.all([
      patientObjectId ? patientsCollection.findOne({ _id: patientObjectId }) : null,
      doctorObjectId ? doctorsCollection.findOne({ _id: doctorObjectId }) : null
    ]);

    const patientName = patient 
      ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.emailAddress || 'Patient'
      : 'Patient';
    
    const doctorName = doctor
      ? doctor.DoctorName || 'Doctor'
      : 'Doctor';

    // Generate tokens
    const doctorToken = generateStreamToken(doctorId.toString(), doctorName);
    const patientToken = generateStreamToken(patientId.toString(), patientName);

    // Generate IDs
    const callId = `call_${_id}_${Date.now()}`;
    const meetingRoomId = `room_${_id}_${Date.now()}`;

    // Determine consultation type
    const consultationType = type && type.toLowerCase().includes('video') ? 'video' : 'audio';

    // Create or update call record
    let call;
    if (existingCall) {
      existingCall.meetingRoomId = meetingRoomId;
      existingCall.doctorToken = doctorToken;
      existingCall.patientToken = patientToken;
      existingCall.consultationType = consultationType;
      existingCall.status = 'waiting';
      call = await existingCall.save();
    } else {
      call = new DocPatientCallModel({
        callId,
        appointmentId: _id.toString(),
        doctorId: doctorId.toString(),
        patientId: patientId.toString(),
        meetingRoomId,
        consultationType,
        doctorToken,
        patientToken,
        status: 'waiting'
      });
      await call.save();
    }

    await call.addLog('room_auto_created', 'system', 'system', { 
      meetingRoomId, 
      consultationType,
      triggeredAt: new Date()
    });

    // Store meetingRoomId in appointment collections for faster lookup
    try {
      const appointmentsCollection = await getCollection('Doctor_appointment');
      const { ObjectId } = require('mongodb');
      const appointmentObjectId = ObjectId.isValid(_id) ? new ObjectId(_id) : _id;
      
      await appointmentsCollection.updateOne(
        { _id: appointmentObjectId },
        { 
          $set: { 
            meetingRoomId: meetingRoomId,
            meetingRoomCreatedAt: new Date()
          } 
        }
      );
    } catch (error) {
      console.error('Error updating appointment with meetingRoomId:', error);
      // Don't fail - this is optional optimization
    }

    // Notify patient that room is ready via Socket.io
    if (io) {
      io.emit('MEETING_ROOM_READY', {
        appointmentId: _id.toString(),
        meetingRoomId,
        patientId: patientId.toString()
      });
      
      // Also emit to specific patient
      io.emit(`PATIENT_ROOM_READY_${patientId.toString()}`, {
        appointmentId: _id.toString(),
        meetingRoomId,
        message: 'Your consultation room is ready. You may now join the waiting room. Your doctor will admit you shortly.'
      });
    }

    // Create patient notification in database
    try {
      await PatientNotificationModel.createNotification({
        patientId: patientId.toString(),
        type: 'consultation_room_ready',
        title: 'Consultation Room Ready',
        description: 'Your consultation room is ready. You may now join the waiting room. Your doctor will admit you shortly.',
        icon: 'videocam',
        appointmentId: _id.toString(),
        doctorName: doctorName,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for room ready: ${patientId.toString()}`);
    } catch (error) {
      console.error('Error creating patient notification for room ready:', error);
    }

    return call;
  } catch (error) {
    console.error('Error creating meeting room:', error);
    throw error;
  }
}

/**
 * Auto-end calls that have exceeded duration
 */
async function autoEndCalls() {
  try {
    const now = new Date();
    // Check both timerEndTime and hardEndTime - use hardEndTime as final stop
    const activeCalls = await DocPatientCallModel.find({
      status: 'active',
      $or: [
        { hardEndTime: { $lte: now } }, // Hard stop reached
        { timerEndTime: { $lte: now }, hardEndTime: { $gt: now } } // Timer ended but not hard stop
      ]
    });

    for (const call of activeCalls) {
      // Check if hard stop reached - always end at hard stop
      const isHardStop = call.hardEndTime && call.hardEndTime <= now;
      
      // If hard stop reached, end immediately
      if (isHardStop) {
        call.status = 'ended';
        call.endedAt = now;
        call.autoEnded = true;
        await call.save();
        await call.addLog('call_auto_ended', 'system', 'system', { 
          timerEndTime: call.timerEndTime,
          hardEndTime: call.hardEndTime,
          extensionCount: call.extensionCount,
          endedAt: now,
          isHardStop: true
        });
      } 
      // If timer ended but hard stop not reached
      else if (call.timerEndTime && call.timerEndTime <= now) {
        // Check if already extended
        if (call.extensionCount >= 1) {
          // Already extended - end immediately (shouldn't happen if hard stop is correct)
          call.status = 'ended';
          call.endedAt = now;
          call.autoEnded = true;
          await call.save();
          await call.addLog('call_auto_ended', 'system', 'system', { 
            timerEndTime: call.timerEndTime,
            hardEndTime: call.hardEndTime,
            extensionCount: call.extensionCount,
            endedAt: now,
            isHardStop: false
          });
        } else {
          // Extension available - emit event but don't auto-end yet
          // The frontend will handle showing extend option
          if (io) {
            io.emit('TIMER_EXPIRED', {
              callId: call.callId || call.meetingRoomId,
              appointmentId: call.appointmentId,
              canExtend: true
            });
          }
          // Don't end yet - wait for extension or hard stop
          continue;
        }
      } else {
        // Should not reach here, but continue to next call
        continue;
      }

      // Stop recording when call auto-ends
      if (call.meetingRoomId) {
        try {
          const stopResult = await streamRecordingService.stopRecording(call.meetingRoomId);
          if (stopResult.success) {
            await call.addLog('recording_stopped', 'system', 'system', { 
              stoppedAt: now,
              autoStopped: true
            });
            
            // Get recording URLs asynchronously
            streamRecordingService.waitForRecordingUrls(call.meetingRoomId, 30, 2000)
              .then(async (urlResult) => {
                if (urlResult.success) {
                  call.audioRecordingUrl = urlResult.audioUrl || null;
                  call.videoRecordingUrl = urlResult.videoUrl || null;
                  await call.save();
                  await call.addLog('recording_urls_ready', 'system', 'system', { 
                    audioUrl: !!urlResult.audioUrl,
                    videoUrl: !!urlResult.videoUrl,
                    autoEnded: true
                  });
                }
              })
              .catch(error => {
                console.error('Error getting recording URLs for auto-ended call:', error);
              });
          }
        } catch (error) {
          console.error('Error stopping recording for auto-ended call:', error);
        }
      }

      if (io) {
        io.emit('CALL_ENDED', {
          callId: call.callId || call.meetingRoomId,
          appointmentId: call.appointmentId,
          autoEnded: true
        });
      }
    }

    return { ended: activeCalls.length };
  } catch (error) {
    console.error('Error auto-ending calls:', error);
    return { ended: 0, error: error.message };
  }
}

/**
 * Check for missed calls
 */
async function checkMissedCalls() {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Find calls where:
    // - Status is waiting or scheduled
    // - Appointment time has passed + 10 minutes
    // - Patient joined waiting room but doctor never started
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    const missedCalls = await DocPatientCallModel.find({
      status: { $in: ['waiting', 'scheduled'] },
      'waitingPatients.0': { $exists: true } // Patient joined waiting room
    });

    let markedMissed = 0;

    for (const call of missedCalls) {
      const appointment = await appointmentsCollection.findOne({ 
        _id: require('mongodb').ObjectId.isValid(call.appointmentId) 
          ? new require('mongodb').ObjectId(call.appointmentId) 
          : null
      });

      if (appointment && appointment.appointmentDate) {
        const appointmentTime = new Date(appointment.appointmentDate);
        const appointmentEndTime = new Date(appointmentTime.getTime() + 10 * 60 * 1000); // +10 minutes

        if (now > appointmentEndTime && !call.startedAt) {
          call.status = 'missed';
          call.endedAt = now;
          await call.save();
          await call.addLog('call_missed', 'system', 'system', { 
            appointmentTime,
            markedAt: now
          });
          markedMissed++;
        }
      }
    }

    return { markedMissed };
  } catch (error) {
    console.error('Error checking missed calls:', error);
    return { markedMissed: 0, error: error.message };
  }
}

/**
 * Detect and classify no-shows
 * Rules:
 * - If doctor never enters meeting room → 'Doctor No-Show'
 * - If patient never enters meeting room → 'Patient No-Show'
 * - If both enter but call fails due to technical issues → 'Technical Failure'
 */
async function detectNoShows() {
  try {
    const now = new Date();
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    // Find calls that should have happened (appointment time passed + 15 minutes buffer)
    // and haven't been classified yet
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    
    const unclassifiedCalls = await DocPatientCallModel.find({
      noShowStatus: null, // Not yet classified
      status: { $in: ['waiting', 'scheduled', 'ended', 'missed'] },
      createdAt: { $lte: fifteenMinutesAgo } // Created at least 15 minutes ago
    });

    let classified = 0;

    for (const call of unclassifiedCalls) {
      const { ObjectId } = require('mongodb');
      const appointmentObjectId = ObjectId.isValid(call.appointmentId) 
        ? new ObjectId(call.appointmentId) 
        : null;
      
      const appointment = appointmentObjectId 
        ? await appointmentsCollection.findOne({ _id: appointmentObjectId })
        : null;

      if (!appointment || !appointment.appointmentDate) {
        continue;
      }

      const appointmentTime = new Date(appointment.appointmentDate);
      const appointmentEndTime = new Date(appointmentTime.getTime() + 15 * 60 * 1000); // +15 minutes buffer

      // Only classify if appointment time has passed
      if (now <= appointmentEndTime) {
        continue;
      }

      const doctorEntered = !!call.doctorEnteredAt;
      const patientEntered = !!call.patientEnteredAt;
      const callEnded = call.status === 'ended' || call.status === 'missed';
      const callActive = call.status === 'active';
      const callDuration = call.startedAt && call.endedAt 
        ? (call.endedAt.getTime() - call.startedAt.getTime()) / 1000 / 60 // Duration in minutes
        : null;

      let noShowStatus = null;

      // Rule 1: Doctor never entered meeting room
      if (!doctorEntered) {
        noShowStatus = 'Doctor No-Show';
      }
      // Rule 2: Patient never entered meeting room (but doctor did)
      else if (!patientEntered && doctorEntered) {
        noShowStatus = 'Patient No-Show';
      }
      // Rule 3: Both entered but call failed due to technical issues
      // (both entered but call ended very quickly < 2 minutes, or ended without proper completion)
      else if (doctorEntered && patientEntered) {
        if (callEnded && callDuration !== null && callDuration < 2) {
          // Call ended very quickly - likely technical failure
          noShowStatus = 'Technical Failure';
        } else if (callEnded && !call.metadata?.admittedAt) {
          // Call ended but patient was never properly admitted - technical issue
          noShowStatus = 'Technical Failure';
        } else if (call.status === 'missed' && doctorEntered && patientEntered) {
          // Both entered but call was marked as missed - technical failure
          noShowStatus = 'Technical Failure';
        }
      }

      // Update call with no-show status if classified
      if (noShowStatus) {
        call.noShowStatus = noShowStatus;
        await call.save();
        await call.addLog('no_show_detected', 'system', 'system', { 
          noShowStatus,
          doctorEntered,
          patientEntered,
          callStatus: call.status,
          callDuration,
          detectedAt: now
        });

        // Trigger notifications based on classification
        await sendNoShowNotifications(call, noShowStatus, appointment);
        
        classified++;
      }
    }

    return { classified };
  } catch (error) {
    console.error('Error detecting no-shows:', error);
    return { classified: 0, error: error.message };
  }
}

/**
 * Send notifications based on no-show classification
 */
async function sendNoShowNotifications(call, noShowStatus, appointment) {
  try {
    const { getCollection } = require('./mongodb');
    const patientsCollection = await getCollection('Patient');
    const doctorsCollection = await getCollection('Doctor');
    const { ObjectId } = require('mongodb');

    const patientObjectId = ObjectId.isValid(call.patientId) ? new ObjectId(call.patientId) : null;
    const doctorObjectId = ObjectId.isValid(call.doctorId) ? new ObjectId(call.doctorId) : null;

    const [patient, doctor] = await Promise.all([
      patientObjectId ? patientsCollection.findOne({ _id: patientObjectId }) : null,
      doctorObjectId ? doctorsCollection.findOne({ _id: doctorObjectId }) : null
    ]);

    const patientName = patient 
      ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.emailAddress || 'Patient'
      : 'Patient';
    
    const doctorName = doctor
      ? doctor.DoctorName || 'Doctor'
      : 'Doctor';

    // Send notifications based on classification
    if (noShowStatus === 'Doctor No-Show') {
      // Notify patient
      if (io) {
        io.emit(`PATIENT_NO_SHOW_${call.patientId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message: `Dr. ${doctorName} did not attend the consultation.`
        });
      }

      await PatientNotificationModel.createNotification({
        patientId: call.patientId,
        type: 'no_show',
        title: 'Doctor No-Show',
        description: `Dr. ${doctorName} did not attend your consultation. Please contact support or reschedule.`,
        icon: 'alert-circle',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        noShowStatus,
        timestamp: new Date()
      });

      // Notify doctor
      if (io) {
        io.emit(`DOCTOR_NO_SHOW_${call.doctorId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message: `You did not attend the consultation with ${patientName}.`
        });
      }

      await DoctorNotificationModel.createNotification({
        doctorId: call.doctorId,
        type: 'no_show',
        title: 'No-Show Detected',
        description: `You did not attend the consultation with ${patientName}. This has been recorded.`,
        icon: 'alert-circle',
        appointmentId: call.appointmentId,
        patientName: patientName,
        noShowStatus,
        timestamp: new Date()
      });
    } else if (noShowStatus === 'Patient No-Show') {
      // Notify doctor
      if (io) {
        io.emit(`DOCTOR_NO_SHOW_${call.doctorId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message: `${patientName} did not attend the consultation.`
        });
      }

      await DoctorNotificationModel.createNotification({
        doctorId: call.doctorId,
        type: 'no_show',
        title: 'Patient No-Show',
        description: `${patientName} did not attend the consultation. This has been recorded.`,
        icon: 'alert-circle',
        appointmentId: call.appointmentId,
        patientName: patientName,
        noShowStatus,
        timestamp: new Date()
      });

      // Notify patient
      if (io) {
        io.emit(`PATIENT_NO_SHOW_${call.patientId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message: `You did not attend the consultation with Dr. ${doctorName}.`
        });
      }

      await PatientNotificationModel.createNotification({
        patientId: call.patientId,
        type: 'no_show',
        title: 'No-Show Detected',
        description: `You did not attend the consultation with Dr. ${doctorName}. Please contact support or reschedule.`,
        icon: 'alert-circle',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        noShowStatus,
        timestamp: new Date()
      });
    } else if (noShowStatus === 'Technical Failure') {
      // Notify both parties
      const message = 'The consultation ended due to technical issues. Please contact support if you need assistance.';

      if (io) {
        io.emit(`DOCTOR_NO_SHOW_${call.doctorId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message
        });

        io.emit(`PATIENT_NO_SHOW_${call.patientId}`, {
          appointmentId: call.appointmentId,
          noShowStatus,
          message
        });
      }

      await DoctorNotificationModel.createNotification({
        doctorId: call.doctorId,
        type: 'technical_failure',
        title: 'Technical Failure',
        description: `The consultation with ${patientName} ended due to technical issues.`,
        icon: 'warning',
        appointmentId: call.appointmentId,
        patientName: patientName,
        noShowStatus,
        timestamp: new Date()
      });

      await PatientNotificationModel.createNotification({
        patientId: call.patientId,
        type: 'technical_failure',
        title: 'Technical Failure',
        description: `The consultation with Dr. ${doctorName} ended due to technical issues.`,
        icon: 'warning',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        noShowStatus,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error sending no-show notifications:', error);
  }
}

/**
 * Main scheduler function - runs every 30 seconds
 */
async function runScheduler() {
  if (mongoose.connection.readyState !== 1) {
    return; // Skip when MongoDB (Mongoose) is not connected
  }
  try {
    const now = new Date();
    const results = {
      remindersSent: 0,
      roomsCreated: 0,
      callsEnded: 0,
      missedCalls: 0,
      timestamp: now
    };

    // Get upcoming appointments (including those in the next hour for reminders)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const appointments = await DocAppointment.find({
      status: 'upcoming',
      appointmentDate: { $gte: new Date(now.getTime() - 10 * 60 * 1000), $lte: oneHourFromNow } // Include appointments up to 10 minutes past
    }).lean();

    for (const appointment of appointments) {
      // Handle both appointmentDate (Date) and appointment_date/appointment_time formats
      let appointmentTime;
      if (appointment.appointmentDate) {
        appointmentTime = new Date(appointment.appointmentDate);
      } else if (appointment.appointment_date && appointment.appointment_time) {
        appointmentTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
      } else {
        continue; // Skip if no valid date
      }
      
      const timeDiff = appointmentTime.getTime() - now.getTime();
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));

      // Get or create call record
      let call = await DocPatientCallModel.findOne({ 
        appointmentId: appointment._id.toString() 
      });

      // 5 minutes before - Create room and send first reminder
      if (minutesDiff <= 5 && minutesDiff > 4.5) {
        if (!call || !call.meetingRoomId) {
          try {
            call = await createMeetingRoom(appointment);
            results.roomsCreated++;
          } catch (error) {
            console.error('Error creating room for appointment:', appointment._id, error);
          }
        }

        if (call && !call.reminders.sent5min) {
          await sendReminderNotification(
            appointment.doctorId.toString(),
            appointment,
            '5min',
            5
          );
          call.reminders.sent5min = true;
          await call.save();
          results.remindersSent++;
        }
      }

      // 2 minutes before - Second reminder
      if (minutesDiff <= 2 && minutesDiff > 1.5) {
        if (call && !call.reminders.sent2min && !call.reminders.doctorAcknowledged) {
          await sendReminderNotification(
            appointment.doctorId.toString(),
            appointment,
            '2min',
            2
          );
          call.reminders.sent2min = true;
          await call.save();
          results.remindersSent++;
        }
      }

      // At consultation time - Third reminder
      if (minutesDiff <= 0 && minutesDiff > -1) {
        if (call && !call.reminders.sent0min && !call.reminders.doctorAcknowledged) {
          await sendReminderNotification(
            appointment.doctorId.toString(),
            appointment,
            '0min',
            0
          );
          call.reminders.sent0min = true;
          await call.save();
          results.remindersSent++;
        }
      }

      // 5 minutes after - Final reminder
      if (minutesDiff <= -5 && minutesDiff > -6) {
        if (call && !call.reminders.sent5minAfter && !call.startedAt) {
          await sendReminderNotification(
            appointment.doctorId.toString(),
            appointment,
            '5minAfter',
            -5
          );
          call.reminders.sent5minAfter = true;
          call.metadata = call.metadata || {};
          call.metadata.doctorLate = true;
          await call.save();
          results.remindersSent++;
        }
      }

      // Set scheduled end time when call starts
      if (call && call.status === 'active' && !call.timerEndTime) {
        const durationMinutes = appointment.duration_minutes || 30;
        const graceMinutes = 5;
        const totalMinutes = durationMinutes + graceMinutes;
        
        // Set timer end time (can be extended)
        call.timerEndTime = new Date(call.startedAt.getTime() + totalMinutes * 60 * 1000);
        // Set hard end time (cannot exceed - includes one possible extension)
        call.hardEndTime = new Date(call.startedAt.getTime() + (totalMinutes + 5) * 60 * 1000);
        call.originalDurationMinutes = durationMinutes;
        call.scheduledEndTime = call.timerEndTime; // For backward compatibility
        await call.save();
      }
    }

    // Auto-end expired calls
    const endedResult = await autoEndCalls();
    results.callsEnded = endedResult.ended || 0;

    // Check for missed calls
    const missedResult = await checkMissedCalls();
    results.missedCalls = missedResult.markedMissed || 0;

    // Detect and classify no-shows
    const noShowResult = await detectNoShows();
    results.noShowsClassified = noShowResult.classified || 0;

    return results;
  } catch (error) {
    console.error('Error in scheduler:', error);
    throw error;
  }
}

module.exports = {
  runScheduler,
  setIO,
  createMeetingRoom,
  autoEndCalls,
  checkMissedCalls,
  detectNoShows
};

