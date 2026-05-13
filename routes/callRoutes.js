const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { StreamChat } = require('stream-chat');
const DocPatientCallModel = require('../models/DocPatientCallModel');
const { ObjectId } = require('mongodb');
const { getCollection } = require('../services/mongodb');
const DoctorNotificationModel = require('../models/DoctorNotificationModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const streamRecordingService = require('../services/streamRecordingService');
const { canAccessCall, extractUserFromRequest } = require('../services/authorizationService');
const fileStorageService = require('../services/fileStorageService');

// Socket.io instance (will be injected from server.js)
let io = null;

// Configure Multer for file uploads (memory storage for now)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: fileStorageService.MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const validation = fileStorageService.validateFile({
      mimetype: file.mimetype,
      size: 0 // Size will be checked after upload
    });
    if (validation.valid) {
      cb(null, true);
    } else {
      cb(new Error(validation.error), false);
    }
  }
});

// Stream Video configuration
const STREAM_API_KEY = '9b9umg6sdvd7';
const STREAM_SECRET = 'eqhe4nxc4h66w4prhw2vn923k3cwy84ydjjdcza7svb9mbu6eq87fpu9rznvq6kc';

// Initialize Stream Chat client (for token generation)
const streamClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_SECRET);

/**
 * Generate Stream token for a user
 */
function generateStreamToken(userId, userName) {
  return streamClient.createToken(userId);
}

/**
 * POST /call/create
 * Create a new call room (Doc_Patient_Call)
 */
router.post('/create', async (req, res) => {
  try {
    const { appointmentId, doctorId, patientId, consultationType = 'video' } = req.body;

    console.log('✅ [CALL_CREATE] Request:', { appointmentId, doctorId, patientId, consultationType });

    if (!appointmentId || !doctorId || !patientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: appointmentId, doctorId, patientId'
      });
    }

    // Check if call already exists for this appointment
    const existingCall = await DocPatientCallModel.findOne({ appointmentId });
    if (existingCall && existingCall.status !== 'ended' && existingCall.status !== 'missed') {
      return res.json({
        success: true,
        callId: existingCall.callId || existingCall._id.toString(),
        meetingRoomId: existingCall.meetingRoomId,
        doctorToken: existingCall.doctorToken,
        patientToken: existingCall.patientToken,
        apiKey: STREAM_API_KEY,
        status: existingCall.status
      });
    }

    // Get doctor and patient names
    const patientsCollection = await getCollection('Patient');
    const doctorsCollection = await getCollection('Doctor');

    // Helper function to safely create ObjectId
    const safeObjectId = (id) => {
      try {
        if (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
          return new ObjectId(id);
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    const patientObjectId = safeObjectId(patientId);
    const doctorObjectId = safeObjectId(doctorId);

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

    // Generate unique call ID and meeting room ID
    const callId = `call_${appointmentId}_${Date.now()}`;
    const meetingRoomId = `room_${appointmentId}_${Date.now()}`;

    // Generate Stream tokens
    const doctorToken = generateStreamToken(doctorId, doctorName);
    const patientToken = generateStreamToken(patientId, patientName);

    // Create call record in Doc_Patient_Call
    const call = new DocPatientCallModel({
      callId,
      appointmentId,
      doctorId,
      patientId,
      meetingRoomId,
      consultationType,
      doctorToken,
      patientToken,
      status: 'scheduled'
    });

    await call.save();
    await call.addLog('room_created', 'system', 'system', { meetingRoomId, consultationType });

    console.log('✅ [CALL_CREATE] Success:', { 
      appointmentId, 
      callId, 
      meetingRoomId, 
      status: call.status,
      hasDoctorToken: !!doctorToken,
      hasPatientToken: !!patientToken
    });

    res.json({
      success: true,
      callId,
      meetingRoomId,
      doctorToken,
      patientToken,
      apiKey: STREAM_API_KEY,
      status: call.status
    });
  } catch (error) {
    console.error('Error creating call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create call',
      error: error.message
    });
  }
});

/**
 * POST /call/start
 * Start a call (marks call as active and notifies patient)
 */
router.post('/start', async (req, res) => {
  try {
    const { callId, appointmentId, userId, userRole } = req.body;

    console.log('✅ [CALL_START] Request:', { callId, appointmentId, userId, userRole });

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: callId'
      });
    }

    // Find by callId or meetingRoomId
    const call = await DocPatientCallModel.findOne({ 
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      console.error('❌ [CALL_START] Call not found:', callId);
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Update call status
    call.status = 'active';
    call.startedAt = new Date();
    
    // Track doctor entering the meeting room
    if (!call.doctorEnteredAt) {
      call.doctorEnteredAt = new Date();
      // Log doctor joined room
      await call.addLog('doctor_joined_room', userId || call.doctorId, userRole || 'doctor', {
        joinedAt: call.doctorEnteredAt,
        meetingRoomId: call.meetingRoomId
      });
    }
    
    // Initialize timer if not already set
    if (!call.timerEndTime || !call.hardEndTime) {
      // Get appointment duration
      const DocAppointment = require('../models/DoctorAppointmentModel');
      const appointment = await DocAppointment.findById(call.appointmentId);
      const durationMinutes = appointment?.duration_minutes || 30; // Default 30 minutes
      const graceMinutes = 5;
      const totalMinutes = durationMinutes + graceMinutes;
      
      // Set timer end time (can be extended)
      call.timerEndTime = new Date(call.startedAt.getTime() + totalMinutes * 60 * 1000);
      // Set hard end time (cannot exceed - includes one possible extension)
      call.hardEndTime = new Date(call.startedAt.getTime() + (totalMinutes + 5) * 60 * 1000);
      call.originalDurationMinutes = durationMinutes;
      call.scheduledEndTime = call.timerEndTime; // For backward compatibility
    }
    
    await call.save();
    await call.addLog('call_started', userId || call.doctorId || 'system', userRole || 'doctor', { 
      startedAt: call.startedAt,
      durationMinutes: call.originalDurationMinutes,
      timerEndTime: call.timerEndTime
    });

    console.log('✅ [CALL_START] Success:', { 
      callId: call.callId, 
      meetingRoomId: call.meetingRoomId,
      status: call.status,
      appointmentId: call.appointmentId,
      patientId: call.patientId
    });

    // Start server-side recording
    if (call.meetingRoomId) {
      try {
        const recordingResult = await streamRecordingService.startRecording(call.meetingRoomId);
        if (recordingResult.success) {
          call.metadata = call.metadata || {};
          call.metadata.recordingId = recordingResult.recordingId;
          call.metadata.recordingStartedAt = new Date();
          await call.save();
          await call.addLog('recording_started', userId || call.doctorId || 'system', userRole || 'doctor', { 
            recordingId: recordingResult.recordingId 
          });
          console.log(`✅ Recording started for call ${call.meetingRoomId}`);
        } else {
          console.error(`⚠️ Failed to start recording: ${recordingResult.error}`);
          // Don't fail the call start if recording fails
        }
      } catch (error) {
        console.error('Error starting recording:', error);
        // Don't fail the call start if recording fails
      }
    }

    // Emit socket event to notify patient
    if (io) {
      io.emit('CALL_STARTED', {
        callId: call.callId || call.meetingRoomId,
        meetingRoomId: call.meetingRoomId,
        appointmentId: call.appointmentId,
        doctorId: call.doctorId
      });
      
      // Emit to specific patient
      io.emit(`PATIENT_CALL_STARTED_${call.patientId}`, {
        appointmentId: call.appointmentId,
        meetingRoomId: call.meetingRoomId,
        message: 'Doctor has started the consultation. Please wait to be admitted.'
      });
    }

    // Create patient notification
    try {
      const doctorsCollection = await getCollection('Doctor');
      const doctorObjectId = ObjectId.isValid(call.doctorId) ? new ObjectId(call.doctorId) : null;
      const doctor = doctorObjectId ? await doctorsCollection.findOne({ _id: doctorObjectId }) : null;
      const doctorName = doctor?.DoctorName || 'Doctor';

      await PatientNotificationModel.createNotification({
        patientId: call.patientId,
        type: 'consultation_started',
        title: 'Consultation Started',
        description: `Dr. ${doctorName} has started the consultation. Please wait to be admitted.`,
        icon: 'videocam',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error creating patient notification for call started:', error);
    }

    res.json({
      success: true,
      message: 'Call started successfully',
      meetingRoomId: call.meetingRoomId || null
    });
  } catch (error) {
    console.error('Error starting call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start call',
      error: error.message
    });
  }
});

/**
 * POST /call/allow
 * Allow a patient to join the call (doctor admits patient)
 */
router.post('/allow', async (req, res) => {
  try {
    const { callId, patientId, userId, userRole } = req.body;

    console.log('✅ [ADMIT_PATIENT] Request:', { callId, patientId, userId, userRole });

    if (!callId || !patientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, patientId'
      });
    }

    const call = await DocPatientCallModel.findOne({ 
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      console.error('❌ [ADMIT_PATIENT] Call not found:', callId);
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // CRITICAL: Verify requester is the doctor for this call
    if (!userId || !userRole || userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors can admit patients'
      });
    }

    // Verify the doctor making the request is the assigned doctor
    if (call.doctorId !== userId && call.doctorId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not the assigned doctor for this call'
      });
    }

    // Verify patient is assigned to this appointment
    if (call.patientId !== patientId && call.patientId.toString() !== patientId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Patient is not assigned to this appointment'
      });
    }

    // Update call status to active if not already
    if (call.status !== 'active') {
      call.status = 'active';
      if (!call.startedAt) {
        call.startedAt = new Date();
      }
    }

    // Add admittedAt timestamp
    call.metadata = call.metadata || {};
    call.metadata.admittedAt = new Date();
    call.metadata.admittedBy = userId || call.doctorId;

    // Track patient entering the meeting room (when admitted)
    if (!call.patientEnteredAt) {
      call.patientEnteredAt = new Date();
    }

    // Remove patient from waiting list (they're now admitted)
    call.waitingPatients = call.waitingPatients.filter(
      p => p.patientId !== patientId && p.patientId.toString() !== patientId
    );
    
    await call.save();
    await call.addLog('doctor_admitted_patient', userId || call.doctorId, userRole || 'doctor', { 
      patientId,
      admittedAt: call.metadata.admittedAt
    });
    await call.addLog('patient_admitted', patientId, 'patient', { 
      admittedBy: userId || call.doctorId,
      admittedAt: call.metadata.admittedAt
    });

    console.log('✅ [ADMIT_PATIENT] Success:', { 
      callId: call.callId, 
      meetingRoomId: call.meetingRoomId,
      patientId,
      appointmentId: call.appointmentId,
      admittedAt: call.metadata.admittedAt
    });

    // Emit socket event to notify patient
    if (io) {
      io.emit('PATIENT_ADMITTED', {
        callId: call.callId || call.meetingRoomId,
        meetingRoomId: call.meetingRoomId,
        patientId,
        appointmentId: call.appointmentId
      });
      
      // Emit to specific patient
      io.emit(`PATIENT_ADMITTED_${patientId}`, {
        appointmentId: call.appointmentId,
        meetingRoomId: call.meetingRoomId,
        message: 'You have been admitted to the consultation. You can now join the call.'
      });
    }

    // Create patient notification
    try {
      const doctorsCollection = await getCollection('Doctor');
      const doctorObjectId = ObjectId.isValid(call.doctorId) ? new ObjectId(call.doctorId) : null;
      const doctor = doctorObjectId ? await doctorsCollection.findOne({ _id: doctorObjectId }) : null;
      const doctorName = doctor?.DoctorName || 'Doctor';

      await PatientNotificationModel.createNotification({
        patientId: patientId,
        type: 'consultation_admitted',
        title: 'Admitted to Consultation',
        description: `Dr. ${doctorName} has admitted you to the consultation. You can now join the call.`,
        icon: 'checkmark-circle',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error creating patient notification for admission:', error);
    }

    res.json({
      success: true,
      message: 'Patient admitted to call',
      meetingRoomId: call.meetingRoomId
    });
  } catch (error) {
    console.error('Error allowing patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to allow patient',
      error: error.message
    });
  }
});

/**
 * GET /call/waiting/:callId
 * Get list of waiting patients
 */
router.get('/waiting/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await DocPatientCallModel.findOne({ 
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    res.json({
      success: true,
      waitingPatients: call.waitingPatients || []
    });
  } catch (error) {
    console.error('Error getting waiting patients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get waiting patients',
      error: error.message
    });
  }
});

/**
 * POST /call/waiting
 * Add patient to waiting room (with authorization check)
 */
router.post('/waiting', async (req, res) => {
  try {
    const { callId, patientId, patientName } = req.body;

    console.log('⏳ [WAITING_ROOM] Request:', { callId, patientId, patientName });

    if (!callId || !patientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, patientId'
      });
    }

    const call = await DocPatientCallModel.findOne({ 
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      console.error('❌ [WAITING_ROOM] Call not found:', callId);
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // CRITICAL: Verify patient is assigned to this appointment
    if (call.patientId !== patientId && call.patientId.toString() !== patientId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Patient is not assigned to this appointment'
      });
    }

    // Check if call is already ended or missed
    if (call.status === 'ended' || call.status === 'missed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot join waiting room: Call has ended'
      });
    }

    // Check if patient is already admitted
    if (call.status === 'active' && call.metadata?.admittedAt) {
      return res.json({
        success: true,
        message: 'Patient already admitted',
        admitted: true,
        meetingRoomId: call.meetingRoomId
      });
    }

    // Check if patient is already in waiting list
    const existingPatient = call.waitingPatients.find(
      p => p.patientId === patientId || p.patientId.toString() === patientId
    );

    if (!existingPatient) {
      call.waitingPatients.push({
        patientId,
        patientName: patientName || 'Patient',
        joinedAt: new Date()
      });
      await call.save();
      await call.addLog('patient_joined_waiting', patientId, 'patient', { 
        patientName: patientName || 'Patient',
        joinedAt: new Date(),
        meetingRoomId: call.meetingRoomId
      });

      console.log('⏳ [WAITING_ROOM] Patient added:', { 
        callId: call.callId, 
        meetingRoomId: call.meetingRoomId,
        patientId,
        patientName,
        waitingCount: call.waitingPatients.length
      });

      // Emit socket event to notify doctor
      if (io) {
        io.emit('PATIENT_WAITING', {
          callId: call.callId || call.meetingRoomId,
          meetingRoomId: call.meetingRoomId,
          appointmentId: call.appointmentId,
          doctorId: call.doctorId,
          patientId,
          patientName: patientName || 'Patient'
        });
        console.log('📡 [WAITING_ROOM] Socket event emitted: PATIENT_WAITING');
      }
    }

    res.json({
      success: true,
      message: 'Patient added to waiting room',
      meetingRoomId: call.meetingRoomId,
      status: call.status
    });
  } catch (error) {
    console.error('Error adding patient to waiting room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add patient to waiting room',
      error: error.message
    });
  }
});

/**
 * GET /call/status/:appointmentId
 * Get call status for an appointment
 * Optional query param: patientId - if provided and matches, returns patientToken
 */
router.get('/status/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { patientId } = req.query;

    // Check for active calls first, then ended/missed calls to get patientEnteredAt info
    let call = await DocPatientCallModel.findOne({ 
      appointmentId,
      status: { $in: ['scheduled', 'waiting', 'active'] }
    }).sort({ createdAt: -1 });
    
    // If no active call found, check for ended/missed calls (to get patientEnteredAt info)
    if (!call) {
      call = await DocPatientCallModel.findOne({ 
        appointmentId,
        status: { $in: ['ended', 'missed'] }
      }).sort({ createdAt: -1 });
    }

    if (!call) {
      return res.json({
        success: true,
        callId: null,
        isActive: false
      });
    }

    // Authorization check: verify user can access this call
    const userInfo = extractUserFromRequest(req);
    if (userInfo) {
      const { userId, userRole } = userInfo;
      if (!canAccessCall(call, userId, userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: You do not have access to this call'
        });
      }
    } else if (patientId) {
      // Legacy check for patientId query param
      if (call.patientId !== patientId && call.patientId.toString() !== patientId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: Patient is not assigned to this appointment'
        });
      }
    }

    const response = {
      success: true,
      callId: call.callId || call._id.toString(),
      meetingRoomId: call.meetingRoomId,
      isActive: call.status === 'active',
      status: call.status,
      apiKey: call.status === 'ended' || call.status === 'missed' ? null : STREAM_API_KEY, // Don't return API key for ended calls
      patientEnteredAt: call.patientEnteredAt || null, // Track if patient actually entered the call
      doctorEnteredAt: call.doctorEnteredAt || null
    };

    // If patientId matches, include patient token and verify authorization
    if (patientId) {
      // Verify patient is assigned to this appointment
      if (call.patientId !== patientId && call.patientId.toString() !== patientId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: Patient is not assigned to this appointment'
        });
      }
      
      response.patientToken = call.patientToken;
      response.isAdmitted = call.metadata?.admittedAt ? true : false;
      // Patient can only join call if: status is active AND they have been admitted
      response.canJoinCall = (call.status === 'active' && call.metadata?.admittedAt) ? true : false;
    }

    res.json(response);
  } catch (error) {
    console.error('Error getting call status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status',
      error: error.message
    });
  }
});

/**
 * POST /call/end
 * End a call
 */
router.post('/end', async (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: callId'
      });
    }

    const call = await DocPatientCallModel.findOne({ 
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    call.status = 'ended';
    call.endedAt = new Date();
    
    // Log who ended the call
    const endedBy = req.body.userId || 'system';
    const endedByRole = req.body.userRole || 'system';
    
    // Generate quality summary if quality logs exist
    if (call.qualityLogs && call.qualityLogs.length > 0) {
      const qualityLogs = call.qualityLogs;
      
      // Calculate averages
      const totalLogs = qualityLogs.length;
      const avgConnectionStability = qualityLogs.reduce((sum, log) => sum + (log.connectionStability || 100), 0) / totalLogs;
      const avgVideoQuality = qualityLogs.reduce((sum, log) => sum + (log.videoQuality || 0), 0) / totalLogs;
      const avgAudioQuality = qualityLogs.reduce((sum, log) => sum + (log.audioQuality || 0), 0) / totalLogs;
      const totalDisconnects = qualityLogs.reduce((sum, log) => sum + (log.disconnectEvents || 0), 0);
      
      call.qualitySummary = {
        averageConnectionStability: Math.round(avgConnectionStability * 100) / 100,
        totalDisconnects: totalDisconnects,
        averageVideoQuality: Math.round(avgVideoQuality * 100) / 100,
        averageAudioQuality: Math.round(avgAudioQuality * 100) / 100,
        generatedAt: new Date()
      };
      
      await call.addLog('quality_summary_generated', 'system', 'system', {
        averageConnectionStability: call.qualitySummary.averageConnectionStability,
        totalDisconnects: call.qualitySummary.totalDisconnects,
        averageVideoQuality: call.qualitySummary.averageVideoQuality,
        averageAudioQuality: call.qualitySummary.averageAudioQuality
      });
    }
    
    await call.save();
    await call.addLog('call_ended', endedBy, endedByRole, { 
      endedAt: call.endedAt,
      endedBy: endedBy,
      endedByRole: endedByRole
    });

    // Stop recording and get URLs
    if (call.meetingRoomId) {
      try {
        // Stop recording
        const stopResult = await streamRecordingService.stopRecording(call.meetingRoomId);
        if (stopResult.success) {
          await call.addLog('recording_stopped', endedBy, endedByRole, { 
            stoppedAt: new Date(),
            meetingRoomId: call.meetingRoomId
          });
          
          // Wait for recording URLs to be available (async, don't block)
          streamRecordingService.waitForRecordingUrls(call.meetingRoomId, 30, 2000)
            .then(async (urlResult) => {
              if (urlResult.success) {
                call.audioRecordingUrl = urlResult.audioUrl || null;
                call.videoRecordingUrl = urlResult.videoUrl || null;
                await call.save();
                await call.addLog('recording_urls_ready', 'system', 'system', { 
                  audioUrl: !!urlResult.audioUrl,
                  videoUrl: !!urlResult.videoUrl
                });
                console.log(`✅ Recording URLs stored for call ${call.meetingRoomId}`);
              } else {
                console.error(`⚠️ Recording URLs not available: ${urlResult.error}`);
                // Try to get recordings directly as fallback
                const recordingsResult = await streamRecordingService.getRecordings(call.meetingRoomId);
                if (recordingsResult.success && recordingsResult.recordings && recordingsResult.recordings.length > 0) {
                  const recording = recordingsResult.recordings[0];
                  if (recording.url) {
                    call.videoRecordingUrl = recording.url;
                    await call.save();
                  }
                }
              }
            })
            .catch(error => {
              console.error('Error getting recording URLs:', error);
            });
        } else {
          console.error(`⚠️ Failed to stop recording: ${stopResult.error}`);
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
        // Don't fail the call end if recording fails
      }
    }

    // Emit socket event to notify patient
    if (io) {
      io.emit('CALL_ENDED', {
        callId: call.callId || call.meetingRoomId,
        appointmentId: call.appointmentId
      });
      
      // Emit to specific patient
      io.emit(`PATIENT_CALL_ENDED_${call.patientId}`, {
        appointmentId: call.appointmentId,
        message: 'The consultation has ended.'
      });
    }

    // Create patient notification
    try {
      const doctorsCollection = await getCollection('Doctor');
      const doctorObjectId = ObjectId.isValid(call.doctorId) ? new ObjectId(call.doctorId) : null;
      const doctor = doctorObjectId ? await doctorsCollection.findOne({ _id: doctorObjectId }) : null;
      const doctorName = doctor?.DoctorName || 'Doctor';

      await PatientNotificationModel.createNotification({
        patientId: call.patientId,
        type: 'consultation_ended',
        title: 'Consultation Ended',
        description: `Your consultation with Dr. ${doctorName} has ended.`,
        icon: 'close-circle',
        appointmentId: call.appointmentId,
        doctorName: doctorName,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error creating patient notification for call ended:', error);
    }

    res.json({
      success: true,
      message: 'Call ended successfully'
    });
  } catch (error) {
    console.error('Error ending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end call',
      error: error.message
    });
  }
});

/**
 * GET /call/recordings/:appointmentId
 * Get recordings for a call (doctor only)
 */
router.get('/recordings/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { userId, userRole } = req.query;

    // Verify user is a doctor or admin
    if (userRole !== 'doctor' && userRole !== 'admin' && !userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors and admins can access recordings'
      });
    }

    const call = await DocPatientCallModel.findOne({ 
      appointmentId,
      status: 'ended'
    }).sort({ createdAt: -1 });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found or not ended'
      });
    }

    // Authorization check: verify user can access this call
    if (userId && userRole) {
      if (!canAccessCall(call, userId, userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You do not have access to this recording'
        });
      }
    }

    // If recording URLs are not yet available, try to fetch them
    if (!call.audioRecordingUrl && !call.videoRecordingUrl && call.meetingRoomId) {
      try {
        const recordingsResult = await streamRecordingService.getRecordings(call.meetingRoomId);
        if (recordingsResult.success && recordingsResult.recordings && recordingsResult.recordings.length > 0) {
          const recording = recordingsResult.recordings[0];
          if (recording.url) {
            call.videoRecordingUrl = recording.url;
            await call.save();
          }
        }
      } catch (error) {
        console.error('Error fetching recordings:', error);
      }
    }

    res.json({
      success: true,
      appointmentId: call.appointmentId,
      audioRecordingUrl: call.audioRecordingUrl || null,
      videoRecordingUrl: call.videoRecordingUrl || null,
      recordingStartedAt: call.metadata?.recordingStartedAt || null,
      callEndedAt: call.endedAt
    });
  } catch (error) {
    console.error('Error getting recordings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recordings',
      error: error.message
    });
  }
});

/**
 * POST /call/upload
 * Upload a file during a call
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { callId, appointmentId, userId, userRole } = req.body;

    if (!callId || !userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, userId, userRole'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    // Validate file
    const validation = fileStorageService.validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    // Check if call is active
    if (call.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'File upload only allowed during active calls'
      });
    }

    // Save file
    const fileInfo = await fileStorageService.saveFile(req.file, call.meetingRoomId || call.callId);

    // Determine file type
    const fileType = fileStorageService.getFileTypeCategory(req.file.mimetype);

    // Add file to call record
    const fileEntry = {
      filename: fileInfo.filename,
      url: fileInfo.url,
      uploadedBy: userId,
      userRole: userRole === 'doctor' ? 'doctor' : 'patient',
      timestamp: new Date(),
      fileType: fileType,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };

    call.files = call.files || [];
    call.files.push(fileEntry);
    await call.save();

    // Log file upload
    await call.addLog('file_uploaded', userId, userRole, {
      filename: fileInfo.filename,
      fileType: fileType,
      size: req.file.size,
      originalName: req.file.originalname,
      url: fileInfo.url
    });

    // Emit Socket.io event to notify other participant
    if (io) {
      const otherParticipantId = userRole === 'doctor' ? call.patientId : call.doctorId;
      io.emit(`FILE_UPLOADED_${otherParticipantId}`, {
        callId: call.callId || call.meetingRoomId,
        appointmentId: call.appointmentId,
        file: fileEntry,
        uploadedBy: userId,
        uploadedByRole: userRole
      });
      
      // Also emit general event
      io.emit('FILE_UPLOADED', {
        callId: call.callId || call.meetingRoomId,
        appointmentId: call.appointmentId,
        file: fileEntry,
        uploadedBy: userId,
        uploadedByRole: userRole
      });
    }

    res.json({
      success: true,
      file: fileEntry,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
});

/**
 * GET /call/files/:callId
 * Get list of files for a call
 */
router.get('/files/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId, userRole } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, userRole'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    // Return files (only for this specific call - isolation enforced)
    res.json({
      success: true,
      files: call.files || [],
      callId: call.callId || call.meetingRoomId
    });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get files',
      error: error.message
    });
  }
});

/**
 * GET /call/files/:callId/:filename
 * Download a file
 */
router.get('/files/:callId/:filename', async (req, res) => {
  try {
    const { callId, filename } = req.params;
    const { userId, userRole } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, userRole'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this file'
      });
    }

    // Find file in call record
    const fileEntry = call.files?.find(f => f.filename === filename);
    if (!fileEntry) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Get file from storage
    const filepath = fileStorageService.getFile(call.meetingRoomId || call.callId, filename);
    if (!filepath) {
      return res.status(404).json({
        success: false,
        message: 'File not found in storage'
      });
    }

    // Send file (use absolute path)
    const absolutePath = path.resolve(filepath);
    res.setHeader('Content-Type', fileEntry.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileEntry.originalName || filename}"`);
    res.sendFile(absolutePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file',
      error: error.message
    });
  }
});

/**
 * POST /call/extend
 * Extend call duration by 5 minutes (doctor only, max once)
 */
router.post('/extend', async (req, res) => {
  try {
    const { callId, userId, userRole } = req.body;

    if (!callId || !userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, userId, userRole'
      });
    }

    // Only doctors can extend
    if (userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors can extend calls'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    // Check if call is active
    if (call.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Can only extend active calls'
      });
    }

    // Check if already extended
    if (call.extensionCount >= 1) {
      return res.status(400).json({
        success: false,
        message: 'Call can only be extended once'
      });
    }

    // Check if timer has expired
    const now = new Date();
    if (call.timerEndTime && call.timerEndTime > now) {
      return res.status(400).json({
        success: false,
        message: 'Can only extend when timer has expired'
      });
    }

    // Check if hard stop has been reached
    if (call.hardEndTime && call.hardEndTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot extend: Hard stop time has been reached'
      });
    }

    // Extend by 5 minutes
    const extensionMinutes = 5;
    const newTimerEndTime = new Date(now.getTime() + extensionMinutes * 60 * 1000);
    
    // Ensure we don't exceed hard end time
    if (call.hardEndTime && newTimerEndTime > call.hardEndTime) {
      call.timerEndTime = call.hardEndTime;
    } else {
      call.timerEndTime = newTimerEndTime;
    }
    
    call.extensionCount = 1;
    call.extensionMinutes = extensionMinutes;
    call.scheduledEndTime = call.timerEndTime; // Update for backward compatibility
    await call.save();

    // Log extension
    await call.addLog('call_extended', userId, userRole, {
      extensionMinutes,
      newTimerEndTime: call.timerEndTime,
      hardEndTime: call.hardEndTime,
      extensionCount: call.extensionCount
    });

    // Emit Socket.io event to notify both participants
    if (io) {
      io.emit('CALL_EXTENDED', {
        callId: call.callId || call.meetingRoomId,
        appointmentId: call.appointmentId,
        extensionMinutes,
        newTimerEndTime: call.timerEndTime,
        hardEndTime: call.hardEndTime
      });
      
      // Notify patient specifically
      io.emit(`CALL_EXTENDED_${call.patientId}`, {
        appointmentId: call.appointmentId,
        extensionMinutes,
        newTimerEndTime: call.timerEndTime
      });
    }

    res.json({
      success: true,
      message: 'Call extended by 5 minutes',
      timerEndTime: call.timerEndTime,
      hardEndTime: call.hardEndTime,
      extensionCount: call.extensionCount
    });
  } catch (error) {
    console.error('Error extending call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend call',
      error: error.message
    });
  }
});

/**
 * GET /call/timer/:callId
 * Get timer information for a call
 */
router.get('/timer/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId, userRole } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, userRole'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    const now = new Date();
    const timerEndTime = call.timerEndTime || call.scheduledEndTime;
    const hardEndTime = call.hardEndTime;
    
    let remainingSeconds = 0;
    if (timerEndTime) {
      remainingSeconds = Math.max(0, Math.floor((timerEndTime.getTime() - now.getTime()) / 1000));
    }

    res.json({
      success: true,
      timerEndTime: timerEndTime,
      hardEndTime: hardEndTime,
      remainingSeconds: remainingSeconds,
      extensionCount: call.extensionCount || 0,
      canExtend: (call.extensionCount || 0) < 1 && hardEndTime && hardEndTime > now,
      originalDurationMinutes: call.originalDurationMinutes || 30
    });
  } catch (error) {
    console.error('Error getting timer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get timer',
      error: error.message
    });
  }
});

/**
 * POST /call/quality
 * Store connection quality metrics (called every 10 seconds from frontend)
 */
router.post('/quality', async (req, res) => {
  try {
    const { callId, userId, userRole, metrics } = req.body;

    if (!callId || !userId || !userRole || !metrics) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, userId, userRole, metrics'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check - only participants can submit metrics
    if (call.doctorId !== userId && call.doctorId.toString() !== userId &&
        call.patientId !== userId && call.patientId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not a participant in this call'
      });
    }

    // Add quality log entry
    const qualityLog = {
      timestamp: new Date(),
      userId,
      userRole,
      packetLoss: metrics.packetLoss || 0,
      jitter: metrics.jitter || 0,
      bitrate: metrics.bitrate || 0,
      audioQuality: metrics.audioQuality || 0,
      videoQuality: metrics.videoQuality || 0,
      disconnectEvents: metrics.disconnectEvents || 0,
      connectionStability: metrics.connectionStability || 100
    };

    call.qualityLogs = call.qualityLogs || [];
    call.qualityLogs.push(qualityLog);
    await call.save();

    res.json({
      success: true,
      message: 'Quality metrics stored'
    });
  } catch (error) {
    console.error('Error storing quality metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store quality metrics',
      error: error.message
    });
  }
});

/**
 * GET /call/quality/:callId
 * Get quality logs for a call (doctors and admins only)
 */
router.get('/quality/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId, userRole } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, userRole'
      });
    }

    // Only doctors and admins can access quality logs
    if (userRole !== 'doctor' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors and admins can access quality logs'
      });
    }

    // Find call
    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check: verify user can access this call
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    res.json({
      success: true,
      qualityLogs: call.qualityLogs || [],
      qualitySummary: call.qualitySummary || null
    });
  } catch (error) {
    console.error('Error getting quality logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get quality logs',
      error: error.message
    });
  }
});

/**
 * POST /call/leave
 * Log when a participant leaves the call
 */
router.post('/leave', async (req, res) => {
  try {
    const { callId, userId, userRole } = req.body;

    if (!callId || !userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, userId, userRole'
      });
    }

    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    // Log leave event
    if (userRole === 'doctor') {
      await call.addLog('doctor_left', userId, userRole, {
        leftAt: new Date(),
        callStatus: call.status
      });
    } else if (userRole === 'patient') {
      await call.addLog('patient_left', userId, userRole, {
        leftAt: new Date(),
        callStatus: call.status
      });
    }

    res.json({
      success: true,
      message: 'Leave event logged'
    });
  } catch (error) {
    console.error('Error logging leave event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log leave event',
      error: error.message
    });
  }
});

/**
 * POST /call/summary
 * Submit consultation summary (doctor only)
 */
router.post('/summary', async (req, res) => {
  try {
    const { callId, userId, userRole, summary } = req.body;

    if (!callId || !userId || !userRole || !summary) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: callId, userId, userRole, summary'
      });
    }

    // Only doctors can submit summaries
    if (userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors can submit summaries'
      });
    }

    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    // Store summary in metadata
    call.metadata = call.metadata || {};
    call.metadata.summary = summary;
    call.metadata.summarySubmittedAt = new Date();
    call.metadata.summarySubmittedBy = userId;
    await call.save();

    // Log summary submission
    await call.addLog('summary_submitted', userId, userRole, {
      submittedAt: new Date(),
      summaryLength: typeof summary === 'string' ? summary.length : JSON.stringify(summary).length
    });

    res.json({
      success: true,
      message: 'Summary submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit summary',
      error: error.message
    });
  }
});

/**
 * GET /call/logs/:callId
 * Get audit trail logs for a call (doctors and admins only)
 */
router.get('/logs/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId, userRole } = req.query;

    if (!userId || !userRole) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, userRole'
      });
    }

    // Only doctors and admins can access audit logs
    if (userRole !== 'doctor' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only doctors and admins can access audit logs'
      });
    }

    const call = await DocPatientCallModel.findOne({
      $or: [{ callId }, { meetingRoomId: callId }]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Authorization check
    if (!canAccessCall(call, userId, userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have access to this call'
      });
    }

    res.json({
      success: true,
      logs: call.logs || [],
      totalLogs: call.logs?.length || 0
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs',
      error: error.message
    });
  }
});

/**
 * GET /call/reminders/run
 * Manually trigger reminder scheduler (for testing)
 */
router.get('/reminders/run', async (req, res) => {
  try {
    const scheduler = require('../services/callScheduler');
    const result = await scheduler.runScheduler();
    res.json({
      success: true,
      message: 'Scheduler run completed',
      result
    });
  } catch (error) {
    console.error('Error running scheduler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run scheduler',
      error: error.message
    });
  }
});

// Export router and setIO function
module.exports = router;
module.exports.setIO = (socketIO) => {
  io = socketIO;
};

