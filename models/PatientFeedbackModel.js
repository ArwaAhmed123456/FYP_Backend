const mongoose = require('mongoose');

const PatientFeedbackSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  doctor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  consultation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoctorAppointment',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer between 1 and 5'
    }
  },
  feedback_text: {
    type: String,
    required: true,
    maxlength: 2000,
    trim: true
  },
  sentiment_label: {
    type: String,
    enum: ['Positive', 'Neutral', 'Negative'],
    // Not required — set after batch processing
    index: true
  },
  sentiment_score: {
    type: Number,
    // Not required — set after batch processing
    min: 0,
    max: 1
  },
  sentimentStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending',
    index: true
  },
  patient_age: {
    type: Number,
    min: 0,
    max: 150
  },
  patient_gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    index: true
  },
  // Populated by the batch processor when feedback_text was in Urdu and translated to English before analysis
  translated_text: {
    type: String,
    maxlength: 2000,
    trim: true
  },
  is_anonymous: {
    type: Boolean,
    default: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'Patient_Feedback'
});

// Unique compound index to prevent duplicate feedback per consultation
PatientFeedbackSchema.index(
  { patient_id: 1, doctor_id: 1, consultation_id: 1 },
  { unique: true, name: 'unique_feedback_per_consultation' }
);

// Index for doctor feedback queries
PatientFeedbackSchema.index({ doctor_id: 1, created_at: -1 });

// Index for patient feedback history
PatientFeedbackSchema.index({ patient_id: 1, created_at: -1 });

// Index for sentiment analysis queries
PatientFeedbackSchema.index({ doctor_id: 1, sentiment_label: 1 });

// Index for batch processor queries
PatientFeedbackSchema.index({ sentimentStatus: 1, created_at: 1 });

const PatientFeedbackModel = mongoose.model('PatientFeedback', PatientFeedbackSchema, 'Patient_Feedback');

module.exports = PatientFeedbackModel;
