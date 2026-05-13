const PatientFeedback = require('../models/PatientFeedbackModel');
const DoctorFeedbackAnalysis = require('../models/DoctorFeedbackAnalysisModel');
const FeedbackAnalysisDashboard = require('../models/FeedbackAnalysisDashboardModel');
const Doctor = require('../models/DoctorModel');
const mongoose = require('mongoose');

/**
 * Helper function to get age group
 */
function getAgeGroup(age) {
  if (!age || age < 18) return 'unknown';
  if (age >= 18 && age <= 25) return '18-25';
  if (age >= 26 && age <= 40) return '26-40';
  if (age >= 41 && age <= 60) return '41-60';
  if (age > 60) return '60+';
  return 'unknown';
}

/**
 * Helper function to get week number from date
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Helper function to get month string from date
 */
function getMonthString(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Extract top keywords from feedback text
 */
function extractTopKeywords(feedbacks, limit = 10) {
  const wordCount = {};
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
    'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'very', 'really',
    'quite', 'too', 'so', 'just', 'only', 'also', 'even', 'still', 'yet', 'doctor', 'dr'
  ]);

  feedbacks.forEach(feedback => {
    if (!feedback.feedback_text) return;
    
    const words = feedback.feedback_text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });

  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/**
 * Get admin feedback analytics
 * GET /admin/feedback-analytics
 */
const getAdminFeedbackAnalytics = async (req, res) => {
  try {
    // Check if dashboard data exists and is recent (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let dashboard = await FeedbackAnalysisDashboard.findOne({
      last_updated: { $gte: oneHourAgo }
    }).lean();

    // If no recent dashboard data, compute it
    if (!dashboard) {
      console.log('📊 Computing admin feedback analytics...');
      dashboard = await computeAdminFeedbackAnalytics();
    }

    // Get all doctor metrics with doctor names
    const doctorAnalyses = await DoctorFeedbackAnalysis.find({})
      .populate('doctor_id', 'DoctorName specialization')
      .sort({ average_rating: -1 })
      .lean();

    const doctorMetrics = doctorAnalyses
      .filter(analysis => analysis.doctor_id && analysis.total_feedback_count > 0)
      .map(analysis => ({
        doctor_id: analysis.doctor_id._id.toString(),
        doctor_name: analysis.doctor_id.DoctorName || 'Unknown Doctor',
        specialization: analysis.doctor_id.specialization || [],
        average_rating: analysis.average_rating || 0,
        total_feedback: analysis.total_feedback_count || 0,
        sentiment_summary: analysis.sentiment_summary || {
          positive: 0,
          neutral: 0,
          negative: 0
        }
      }));

    // Get extreme feedback (very positive or very negative)
    const extremeFeedback = await PatientFeedback.find({
      $or: [
        { sentiment_label: 'Negative', sentiment_score: { $lt: 0.3 } },
        { sentiment_label: 'Positive', sentiment_score: { $gt: 0.8 }, rating: 5 }
      ]
    })
      .select('_id feedback_text sentiment_label sentiment_score rating created_at')
      .sort({ created_at: -1 })
      .limit(20)
      .lean();

    // Extract top keywords
    const allFeedbacks = await PatientFeedback.find({})
      .select('feedback_text')
      .limit(1000)
      .lean();
    
    const topKeywords = extractTopKeywords(allFeedbacks, 15);

    res.json({
      platform_metrics: dashboard.platform_metrics,
      doctor_metrics: doctorMetrics,
      patient_demographics: dashboard.patient_demographics,
      sentiment_summary: dashboard.sentiment_summary,
      sentiment_trends: dashboard.monthly_sentiment_trends.slice(-12), // Last 12 months
      weekly_sentiment_trends: dashboard.weekly_sentiment_trends.slice(-12), // Last 12 weeks
      monthly_rating_trends: dashboard.monthly_rating_trends.slice(-12), // Last 12 months
      feedback_text_analysis: {
        top_keywords: topKeywords,
        extreme_feedback: extremeFeedback.map(f => ({
          feedback_id: f._id.toString(),
          sentiment: f.sentiment_label.toLowerCase(),
          text: f.feedback_text.substring(0, 200), // Truncate for privacy
          rating: f.rating,
          created_at: f.created_at
        }))
      },
      last_updated: dashboard.last_updated
    });
  } catch (error) {
    console.error('Error getting admin feedback analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback analytics',
      error: error.message
    });
  }
};

/**
 * Compute and store admin feedback analytics
 * This function aggregates data from Patient_Feedback collection
 */
async function computeAdminFeedbackAnalytics() {
  try {
    // Aggregate platform metrics
    const platformMetrics = await PatientFeedback.aggregate([
      {
        $group: {
          _id: null,
          total_feedback: { $sum: 1 },
          average_rating: { $avg: '$rating' },
          unique_doctors: { $addToSet: '$doctor_id' },
          unique_patients: { $addToSet: '$patient_id' }
        }
      }
    ]);

    const metrics = platformMetrics[0] || {
      total_feedback: 0,
      average_rating: 0,
      unique_doctors: [],
      unique_patients: []
    };

    // Get all feedback for demographics and sentiment
    const allFeedbacks = await PatientFeedback.find({})
      .select('patient_age patient_gender sentiment_label created_at')
      .lean();

    // Calculate demographics
    const ageDistribution = {
      '18-25': 0,
      '26-40': 0,
      '41-60': 0,
      '60+': 0,
      'unknown': 0
    };

    const genderDistribution = {
      male: 0,
      female: 0,
      other: 0,
      unknown: 0
    };

    const sentimentSummary = {
      positive: 0,
      neutral: 0,
      negative: 0
    };

    // Monthly and weekly trends
    const monthlySentimentMap = {};
    const weeklySentimentMap = {};
    const monthlyRatingMap = {};

    allFeedbacks.forEach(feedback => {
      // Age distribution
      if (feedback.patient_age) {
        const ageGroup = getAgeGroup(feedback.patient_age);
        ageDistribution[ageGroup]++;
      } else {
        ageDistribution['unknown']++;
      }

      // Gender distribution
      if (feedback.patient_gender) {
        const gender = feedback.patient_gender.toLowerCase();
        if (genderDistribution.hasOwnProperty(gender)) {
          genderDistribution[gender]++;
        } else {
          genderDistribution['other']++;
        }
      } else {
        genderDistribution['unknown']++;
      }

      // Sentiment summary
      if (feedback.sentiment_label) {
        const sentiment = feedback.sentiment_label.toLowerCase();
        if (sentimentSummary.hasOwnProperty(sentiment)) {
          sentimentSummary[sentiment]++;
        }
      }

      // Monthly trends
      if (feedback.created_at) {
        const month = getMonthString(feedback.created_at);
        
        if (!monthlySentimentMap[month]) {
          monthlySentimentMap[month] = { positive: 0, neutral: 0, negative: 0 };
        }
        const sentiment = feedback.sentiment_label?.toLowerCase() || 'neutral';
        if (monthlySentimentMap[month].hasOwnProperty(sentiment)) {
          monthlySentimentMap[month][sentiment]++;
        }

        // Weekly trends (last 12 weeks)
        const week = getWeekNumber(feedback.created_at);
        if (!weeklySentimentMap[week]) {
          weeklySentimentMap[week] = { positive: 0, neutral: 0, negative: 0 };
        }
        if (weeklySentimentMap[week].hasOwnProperty(sentiment)) {
          weeklySentimentMap[week][sentiment]++;
        }
      }
    });

    // Get monthly rating trends
    const monthlyRatingData = await PatientFeedback.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' }
          },
          average_rating: { $avg: '$rating' },
          feedback_count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    const monthlyRatingTrends = monthlyRatingData.map(item => ({
      month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
      average_rating: Math.round(item.average_rating * 10) / 10,
      feedback_count: item.feedback_count
    }));

    // Convert maps to arrays and sort
    const monthlySentimentTrends = Object.entries(monthlySentimentMap)
      .map(([month, sentiments]) => ({
        month,
        ...sentiments
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const weeklySentimentTrends = Object.entries(weeklySentimentMap)
      .map(([week, sentiments]) => ({
        week,
        ...sentiments
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Update or create dashboard
    const dashboard = await FeedbackAnalysisDashboard.findOneAndUpdate(
      {},
      {
        platform_metrics: {
          total_feedback: metrics.total_feedback,
          average_rating: Math.round(metrics.average_rating * 10) / 10,
          total_doctors: metrics.unique_doctors.length,
          total_patients: metrics.unique_patients.length
        },
        patient_demographics: {
          age_distribution: ageDistribution,
          gender_distribution: genderDistribution
        },
        sentiment_summary: sentimentSummary,
        monthly_sentiment_trends: monthlySentimentTrends,
        weekly_sentiment_trends: weeklySentimentTrends,
        monthly_rating_trends: monthlyRatingTrends,
        last_updated: new Date()
      },
      { upsert: true, new: true }
    ).lean();

    console.log('✅ Admin feedback analytics computed and stored');
    return dashboard;
  } catch (error) {
    console.error('Error computing admin feedback analytics:', error);
    throw error;
  }
}

/**
 * Force refresh of admin feedback analytics
 * POST /admin/feedback-analytics/refresh
 */
const refreshAdminFeedbackAnalytics = async (req, res) => {
  try {
    const dashboard = await computeAdminFeedbackAnalytics();
    res.json({
      success: true,
      message: 'Feedback analytics refreshed successfully',
      last_updated: dashboard.last_updated
    });
  } catch (error) {
    console.error('Error refreshing admin feedback analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh feedback analytics',
      error: error.message
    });
  }
};

/**
 * Get admin feedback list (anonymized, paginated, filterable)
 * GET /admin/feedback-list
 */
const getAdminFeedbackList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      doctor_id,
      rating,
      sentiment,
      start_date,
      end_date,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    // Filter by doctor
    if (doctor_id) {
      query.doctor_id = new mongoose.Types.ObjectId(doctor_id);
    }

    // Filter by rating
    if (rating) {
      const ratingNum = parseInt(rating);
      if (!isNaN(ratingNum) && ratingNum >= 1 && ratingNum <= 5) {
        query.rating = ratingNum;
      }
    }

    // Filter by sentiment
    if (sentiment) {
      const sentimentMap = {
        'positive': 'Positive',
        'neutral': 'Neutral',
        'negative': 'Negative'
      };
      if (sentimentMap[sentiment.toLowerCase()]) {
        query.sentiment_label = sentimentMap[sentiment.toLowerCase()];
      }
    }

    // Filter by date range
    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) {
        query.created_at.$gte = new Date(start_date);
      }
      if (end_date) {
        const endDate = new Date(end_date);
        endDate.setHours(23, 59, 59, 999); // End of day
        query.created_at.$lte = endDate;
      }
    }

    // Search in feedback text
    if (search) {
      query.feedback_text = { $regex: search, $options: 'i' };
    }

    // Get feedback (anonymized - no patient info)
    const feedbacks = await PatientFeedback.find(query)
      .populate('doctor_id', 'DoctorName specialization')
      .select('rating feedback_text sentiment_label sentiment_score created_at doctor_id')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await PatientFeedback.countDocuments(query);

    // Format response (ensure patient anonymity)
    const formattedFeedbacks = feedbacks.map(fb => ({
      feedback_id: fb._id.toString(),
      doctor_id: fb.doctor_id?._id?.toString() || '',
      doctor_name: fb.doctor_id?.DoctorName || 'Unknown Doctor',
      specialization: fb.doctor_id?.specialization || [],
      rating: fb.rating,
      feedback_text: fb.feedback_text,
      sentiment_label: fb.sentiment_label,
      sentiment_score: fb.sentiment_score,
      created_at: fb.created_at
    }));

    res.json({
      success: true,
      feedbacks: formattedFeedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting admin feedback list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback list',
      error: error.message
    });
  }
};

// In-memory flag to prevent concurrent batch runs
let isBatchRunning = false;

/**
 * Trigger on-demand sentiment batch processing
 * POST /api/admin/sentiment/run-batch
 */
const runBatchSentiment = async (req, res) => {
  if (isBatchRunning) {
    return res.status(409).json({
      success: false,
      message: 'Sentiment batch is already running. Please wait for it to complete.'
    });
  }

  isBatchRunning = true;
  try {
    const { runSentimentBatch } = require('../services/sentimentBatchService');
    const summary = await runSentimentBatch();
    res.json({
      success: true,
      message: 'Sentiment batch completed',
      summary
    });
  } catch (err) {
    console.error('[runBatchSentiment] Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Sentiment batch failed',
      error: err.message
    });
  } finally {
    isBatchRunning = false;
  }
};

module.exports = {
  getAdminFeedbackAnalytics,
  refreshAdminFeedbackAnalytics,
  computeAdminFeedbackAnalytics,
  getAdminFeedbackList,
  runBatchSentiment
};

