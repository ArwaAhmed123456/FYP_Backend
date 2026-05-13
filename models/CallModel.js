const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  appointmentId: {
    type: String,
    required: true,
    index: true
  },
  doctorId: {
    type: String,
    required: true
  },
  patientId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'active', 'ended'],
    default: 'created'
  },
  doctorToken: {
    type: String,
    required: true
  },
  patientToken: {
    type: String,
    required: true
  },
  waitingPatients: [{
    patientId: String,
    patientName: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
CallSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const CallModel = mongoose.model('Call', CallSchema);

module.exports = CallModel;

