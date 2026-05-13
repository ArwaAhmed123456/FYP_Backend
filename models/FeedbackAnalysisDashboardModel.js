const mongoose = require('mongoose');

const FeedbackAnalysisDashboardSchema = new mongoose.Schema({
  // Platform-level metrics
  platform_metrics: {
    total_feedback: {
      type: Number,
      default: 0,
      min: 0
    },
    average_rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    total_doctors: {
      type: Number,
      default: 0,
      min: 0
    },
    total_patients: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Patient demographics
  patient_demographics: {
    age_distribution: {
      '18-25': { type: Number, default: 0 },
      '26-40': { type: Number, default: 0 },
      '41-60': { type: Number, default: 0 },
      '60+': { type: Number, default: 0 },
      'unknown': { type: Number, default: 0 }
    },
    gender_distribution: {
      male: { type: Number, default: 0 },
      female: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 }
    }
  },
  
  // Overall sentiment summary
  sentiment_summary: {
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 }
  },
  
  // Monthly sentiment trends
  monthly_sentiment_trends: [{
    month: { type: String, required: true }, // Format: "YYYY-MM"
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 }
  }],
  
  // Weekly sentiment trends (last 12 weeks)
  weekly_sentiment_trends: [{
    week: { type: String, required: true }, // Format: "YYYY-WW"
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 }
  }],
  
  // Monthly rating trends
  monthly_rating_trends: [{
    month: { type: String, required: true }, // Format: "YYYY-MM"
    average_rating: { type: Number, default: 0 },
    feedback_count: { type: Number, default: 0 }
  }],
  
  // Last updated timestamp
  last_updated: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'Feedback_Analysis_Dashboard'
});

// Index for quick lookups
FeedbackAnalysisDashboardSchema.index({ last_updated: -1 });

const FeedbackAnalysisDashboardModel = mongoose.model(
  'FeedbackAnalysisDashboard',
  FeedbackAnalysisDashboardSchema,
  'Feedback_Analysis_Dashboard'
);

module.exports = FeedbackAnalysisDashboardModel;

