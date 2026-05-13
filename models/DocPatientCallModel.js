const mongoose = require('mongoose');
const { encrypt, decrypt, encryptObject, decryptObject, encryptArray, decryptArray } = require('../services/encryptionService');

const DocPatientCallSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    required: true,
    index: true
  },
  patientId: {
    type: String,
    required: true,
    index: true
  },
  appointmentId: {
    type: String,
    required: true,
    index: true
  },
  meetingRoomId: {
    type: String,
    index: true
  },
  consultationType: {
    type: String,
    enum: ['video', 'audio'],
    default: 'video'
  },
  status: {
    type: String,
    enum: ['scheduled', 'waiting', 'active', 'ended', 'missed'],
    default: 'scheduled',
    index: true
  },
  doctorToken: {
    type: String
  },
  patientToken: {
    type: String
  },
  audioRecordingUrl: {
    type: String
  },
  videoRecordingUrl: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Logging and auditing (immutable, append-only)
  logs: [{
    action: {
      type: String,
      required: true,
      enum: [
        'room_created',
        'room_auto_created',
        'patient_joined_waiting',
        'doctor_joined_room',
        'doctor_admitted_patient',
        'patient_admitted',
        'call_started',
        'call_ended',
        'patient_left',
        'doctor_left',
        'file_uploaded',
        'summary_submitted',
        'recording_started',
        'recording_stopped',
        'recording_urls_ready',
        'call_extended',
        'call_missed',
        'no_show_detected',
        'quality_summary_generated',
        'call_auto_ended'
      ]
    },
    timestamp: { 
      type: Date, 
      default: Date.now,
      required: true,
      immutable: true // Cannot be modified after creation
    },
    actor: {
      type: String,
      required: true,
      enum: ['doctorId', 'patientId', 'system']
    },
    actorId: {
      type: String,
      required: true // The actual ID of the actor (doctorId, patientId, or 'system')
    },
    userRole: {
      type: String,
      enum: ['doctor', 'patient', 'system', 'admin']
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  // Legacy fields for backward compatibility
  callId: {
    type: String,
    index: true
  },
  waitingPatients: [{
    patientId: String,
    patientName: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  startedAt: {
    type: Date,
    index: true
  },
  endedAt: {
    type: Date
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Reminder tracking
  reminders: {
    sent5min: { type: Boolean, default: false },
    sent2min: { type: Boolean, default: false },
    sent0min: { type: Boolean, default: false },
    sent5minAfter: { type: Boolean, default: false },
    doctorAcknowledged: { type: Boolean, default: false },
    acknowledgedAt: Date
  },
  // Auto-end tracking
  scheduledEndTime: Date,
  autoEnded: { type: Boolean, default: false },
  // Timer tracking
  originalDurationMinutes: { type: Number }, // Appointment duration from appointment record
  timerEndTime: { type: Date }, // When timer should end (can be extended)
  hardEndTime: { type: Date }, // Hard stop time (cannot exceed)
  extensionCount: { type: Number, default: 0 }, // Number of extensions (max 1)
  extensionMinutes: { type: Number, default: 0 }, // Total extension minutes
  // File sharing
  files: [{
    filename: { type: String, required: true },
    url: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    userRole: { type: String, enum: ['doctor', 'patient'], required: true },
    timestamp: { type: Date, default: Date.now },
    fileType: { type: String, enum: ['image', 'pdf', 'audio', 'document', 'other'], required: true },
    originalName: { type: String },
    size: { type: Number },
    mimetype: { type: String }
  }],
  // No-show detection
  noShowStatus: {
    type: String,
    enum: ['Doctor No-Show', 'Patient No-Show', 'Technical Failure', null],
    default: null,
    index: true
  },
  // Room entry tracking
  doctorEnteredAt: { type: Date },
  patientEnteredAt: { type: Date },
  // Connection quality monitoring (doctors/admins only)
  qualityLogs: [{
    timestamp: { type: Date, default: Date.now },
    userId: String,
    userRole: String,
    packetLoss: { type: Number, default: 0 }, // percentage
    jitter: { type: Number, default: 0 }, // milliseconds
    bitrate: { type: Number, default: 0 }, // kbps
    audioQuality: { type: Number, default: 0 }, // score 0-100
    videoQuality: { type: Number, default: 0 }, // score 0-100
    disconnectEvents: { type: Number, default: 0 }, // count
    connectionStability: { type: Number, default: 100 } // percentage
  }],
  // Quality summary (generated at end of call)
  qualitySummary: {
    averageConnectionStability: { type: Number },
    totalDisconnects: { type: Number, default: 0 },
    averageVideoQuality: { type: Number },
    averageAudioQuality: { type: Number },
    generatedAt: { type: Date }
  }
});

// Update the updatedAt field before saving
DocPatientCallSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Ensure logs are immutable and append-only
  if (Array.isArray(this.logs) && this.logs.length > 0) {
    this.logs = this.logs.map((log, index) => {
      // Prevent modification of existing logs (immutability)
      if (log.timestamp && log._id) {
        // This is an existing log - preserve it as-is
        return log;
      }
      
      // New log entry - encrypt metadata if present
      if (log.metadata && typeof log.metadata === 'object') {
        const metadataString = JSON.stringify(log.metadata);
        if (!metadataString.startsWith('ENC:')) {
          log.metadata = encryptObject(log.metadata);
        }
      }
      
      // Ensure required fields
      if (!log.timestamp) {
        log.timestamp = new Date();
      }
      
      return log;
    });
  }
  
  // Encrypt metadata (especially recording metadata)
  if (this.metadata && typeof this.metadata === 'object') {
    // Check if already encrypted (stored as string)
    if (typeof this.metadata === 'string' && this.metadata.startsWith('ENC:')) {
      // Already encrypted, skip
    } else {
      // Encrypt metadata object
      this.metadata = encryptObject(this.metadata);
    }
  }
  
  next();
});

// Decrypt sensitive fields after finding
DocPatientCallSchema.post(['find', 'findOne', 'findOneAndUpdate'], function(docs) {
  if (!docs) return;
  
  const documents = Array.isArray(docs) ? docs : [docs];
  
  documents.forEach(doc => {
    if (!doc) return;
    
    // Decrypt logs
    if (Array.isArray(doc.logs)) {
      doc.logs = doc.logs.map(log => {
        // Handle legacy 'details' field
        if (log.details) {
          if (typeof log.details === 'string' && log.details.startsWith('ENC:')) {
            log.details = decryptObject(log.details);
          }
        }
        // Handle new 'metadata' field
        if (log.metadata) {
          if (typeof log.metadata === 'string' && log.metadata.startsWith('ENC:')) {
            log.metadata = decryptObject(log.metadata);
          }
        }
        return log;
      });
    }
    
    // Decrypt metadata
    if (doc.metadata) {
      if (typeof doc.metadata === 'string' && doc.metadata.startsWith('ENC:')) {
        doc.metadata = decryptObject(doc.metadata);
      }
    }
  });
});

/**
 * Add log entry to audit trail (immutable, append-only)
 * @param {string} action - The action being logged (must be in enum)
 * @param {string} actorId - The ID of the actor (doctorId, patientId, or 'system')
 * @param {string} userRole - The role of the user ('doctor', 'patient', 'system', 'admin')
 * @param {object} metadata - Additional metadata for the log entry
 * @returns {Promise} - Promise that resolves when log is saved
 */
DocPatientCallSchema.methods.addLog = function(action, actorId, userRole, metadata = {}) {
  // Determine actor type based on actorId and userRole
  let actor = 'system';
  if (actorId === 'system' || !actorId) {
    actor = 'system';
    actorId = 'system';
  } else if (userRole === 'doctor' || actorId === this.doctorId || actorId === this.doctorId.toString()) {
    actor = 'doctorId';
    actorId = this.doctorId.toString();
  } else if (userRole === 'patient' || actorId === this.patientId || actorId === this.patientId.toString()) {
    actor = 'patientId';
    actorId = this.patientId.toString();
  } else {
    // Default to system if cannot determine
    actor = 'system';
    actorId = 'system';
  }
  
  // Encrypt metadata before adding to log
  let encryptedMetadata = metadata;
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
    encryptedMetadata = encryptObject(metadata);
  }
  
  // Create immutable log entry
  const logEntry = {
    action,
    timestamp: new Date(),
    actor,
    actorId,
    userRole: userRole || 'system',
    metadata: encryptedMetadata
  };
  
  // Append to logs array (append-only)
  this.logs = this.logs || [];
  this.logs.push(logEntry);
  
  return this.save();
};

const DocPatientCallModel = mongoose.model('DocPatientCall', DocPatientCallSchema, 'Doc_Patient_Call');

module.exports = DocPatientCallModel;

