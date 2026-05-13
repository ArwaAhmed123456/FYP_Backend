const mongoose = require('mongoose');

const MeetingSummarySchema = new mongoose.Schema({
  appointmentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  callId: {
    type: String,
    required: true
  },
  doctorId: {
    type: String,
    required: true
  },
  patientId: {
    type: String,
    required: true
  },
  doctorName: {
    type: String,
    default: ''
  },
  patientName: {
    type: String,
    default: ''
  },
  transcript: [{
    speaker: { type: String, enum: ['doctor', 'patient'] },
    text: { type: String },
    timestamp: { type: Number }
  }],
  summary: {
    overview: { type: String, default: '' },
    symptomsDiscussed: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    prescriptions: { type: String, default: '' },
    followUpPlan: { type: String, default: '' },
    additionalNotes: { type: String, default: '' }
  },
  language: {
    type: String,
    default: 'en'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'meeting_summaries'
});

module.exports = mongoose.model('MeetingSummary', MeetingSummarySchema);
