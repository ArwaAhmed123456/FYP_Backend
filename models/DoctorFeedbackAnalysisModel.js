const mongoose = require('mongoose');

const DoctorFeedbackAnalysisSchema = new mongoose.Schema({
  doctor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    unique: true
  },
  average_rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  total_feedback_count: {
    type: Number,
    default: 0,
    min: 0
  },
  sentiment_summary: {
    positive: {
      type: Number,
      default: 0,
      min: 0
    },
    neutral: {
      type: Number,
      default: 0,
      min: 0
    },
    negative: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  age_demographics: {
    type: Map,
    of: Number,
    default: {}
  },
  gender_demographics: {
    male: {
      type: Number,
      default: 0,
      min: 0
    },
    female: {
      type: Number,
      default: 0,
      min: 0
    },
    other: {
      type: Number,
      default: 0,
      min: 0
    },
    'prefer not to say': {
      type: Number,
      default: 0,
      min: 0
    }
  },
  last_updated: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  // Future fields for trends (optional, can be populated later)
  monthly_trends: {
    type: Map,
    of: {
      average_rating: Number,
      feedback_count: Number,
      sentiment: {
        positive: Number,
        neutral: Number,
        negative: Number
      }
    },
    default: {}
  },
  weekly_sentiment_trends: {
    type: Map,
    of: {
      positive: Number,
      neutral: Number,
      negative: Number
    },
    default: {}
  }
}, {
  timestamps: true,
  collection: 'Doctor_Feedback_Analysis'
});

// Index for quick lookups
DoctorFeedbackAnalysisSchema.index({ doctor_id: 1 });
DoctorFeedbackAnalysisSchema.index({ average_rating: -1 }); // For sorting doctors by rating

const DoctorFeedbackAnalysisModel = mongoose.model(
  'DoctorFeedbackAnalysis',
  DoctorFeedbackAnalysisSchema,
  'Doctor_Feedback_Analysis'
);

module.exports = DoctorFeedbackAnalysisModel;

