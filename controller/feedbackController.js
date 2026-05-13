const PatientFeedback = require('../models/PatientFeedbackModel');
const DoctorFeedbackAnalysis = require('../models/DoctorFeedbackAnalysisModel');
const DoctorAppointment = require('../models/DoctorAppointmentModel');
const Patient = require('../models/PatientModel');
const { sanitizeFeedbackText } = require('../services/sentimentAnalysisService');
const mongoose = require('mongoose');
const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

/**
 * Submit feedback after consultation
 * POST /api/feedback/submit
 */
const submitFeedback = async (req, res) => {
  try {
    const { 
      patient_id, 
      doctor_id, 
      consultation_id, 
      rating, 
      feedback_text,
      is_anonymous = true 
    } = req.body;

    // Validation
    if (!patient_id || !doctor_id || !consultation_id || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: patient_id, doctor_id, consultation_id, rating'
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5'
      });
    }

    // Sanitize feedback text
    const sanitizedText = sanitizeFeedbackText(feedback_text || '');

    // Verify consultation exists and belongs to patient
    const consultation = await DoctorAppointment.findById(consultation_id);
    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    if (consultation.patientId.toString() !== patient_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This consultation does not belong to you'
      });
    }

    if (consultation.doctorId.toString() !== doctor_id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID does not match consultation'
      });
    }

    // Check if feedback already exists (unique index will also prevent this)
    const existingFeedback = await PatientFeedback.findOne({
      patient_id: new mongoose.Types.ObjectId(patient_id),
      doctor_id: new mongoose.Types.ObjectId(doctor_id),
      consultation_id: new mongoose.Types.ObjectId(consultation_id)
    });

    if (existingFeedback) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted for this consultation'
      });
    }

    // Get patient demographics
    const patient = await Patient.findById(patient_id);
    let patient_age = null;
    let patient_gender = null;

    if (patient) {
      // PatientModel stores age directly as `Age` (integer field)
      if (patient.Age) {
        patient_age = parseInt(patient.Age);
      } else if (patient.dateOfBirth) {
        const birthDate = new Date(patient.dateOfBirth);
        const today = new Date();
        patient_age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          patient_age--;
        }
      }
      patient_gender = patient.gender || null;
    }

    // For in-person consultations enforce the 24-hour review window
    const isInPerson = (consultation.type || '').toLowerCase().replace(/\s/g, '') === 'in-person';
    if (isInPerson) {
      const windowStart = consultation.endTime || consultation.appointmentDate;
      if (windowStart) {
        const windowEnd = new Date(windowStart).getTime() + 24 * 60 * 60 * 1000;
        if (Date.now() > windowEnd) {
          return res.status(400).json({
            success: false,
            message: 'Review window has closed. Reviews must be submitted within 24 hours of the consultation.'
          });
        }
      }
    }

    // Create feedback — sentiment will be set by batch processor
    const feedback = await PatientFeedback.create({
      patient_id: new mongoose.Types.ObjectId(patient_id),
      doctor_id: new mongoose.Types.ObjectId(doctor_id),
      consultation_id: new mongoose.Types.ObjectId(consultation_id),
      rating,
      feedback_text: sanitizedText,
      sentimentStatus: 'pending',
      patient_age,
      patient_gender,
      is_anonymous,
      created_at: new Date()
    });

    // Mark the appointment as reviewed so the button is hidden
    await DoctorAppointment.updateOne(
      { _id: new mongoose.Types.ObjectId(consultation_id) },
      { $set: { reviewSubmitted: true } }
    );

    // Mark the review_request notification as reviewed so its button disappears
    try {
      const notifCol = await getCollection('Patient_Notifications');
      await notifCol.updateMany(
        {
          patientId: new ObjectId(patient_id.toString()),
          appointmentId: new ObjectId(consultation_id.toString()),
          type: 'review_request',
        },
        { $set: { reviewed: true } }
      );
    } catch (_) {
      // Non-critical — don't break the response if notification update fails
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        _id: feedback._id,
        rating: feedback.rating,
        sentimentStatus: feedback.sentimentStatus,
        created_at: feedback.created_at
      }
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted for this consultation'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
};

/**
 * Get patient's feedback history
 * GET /api/patient/feedback-history
 */
const getPatientFeedbackHistory = async (req, res) => {
  try {
    const { patient_id } = req.query;
    const { page = 1, limit = 20 } = req.query;

    if (!patient_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: patient_id'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get feedback with pagination
    // Note: We don't populate consultation_id if the model isn't available
    const feedbacks = await PatientFeedback.find({
      patient_id: new mongoose.Types.ObjectId(patient_id)
    })
      .populate('doctor_id', 'DoctorName specialization')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Manually add consultation date if needed (optional)
    // The consultation_id is already in the feedback document

    const total = await PatientFeedback.countDocuments({
      patient_id: new mongoose.Types.ObjectId(patient_id)
    });

    res.json({
      success: true,
      feedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting patient feedback history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback history',
      error: error.message
    });
  }
};

/**
 * Get doctor feedback summary (for patient view - public)
 * GET /api/doctor/:id/feedback-summary
 */
const getDoctorFeedbackSummary = async (req, res) => {
  try {
    const { id: doctor_id } = req.params;

    const analysis = await DoctorFeedbackAnalysis.findOne({
      doctor_id: new mongoose.Types.ObjectId(doctor_id)
    }).lean();

    if (!analysis) {
      return res.json({
        success: true,
        summary: {
          average_rating: 0,
          total_feedback_count: 0,
          sentiment_summary: {
            positive: 0,
            neutral: 0,
            negative: 0
          },
          has_feedback: false
        }
      });
    }

    res.json({
      success: true,
      summary: {
        average_rating: analysis.average_rating,
        total_feedback_count: analysis.total_feedback_count,
        sentiment_summary: analysis.sentiment_summary,
        has_feedback: analysis.total_feedback_count > 0
      }
    });
  } catch (error) {
    console.error('Error getting doctor feedback summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback summary',
      error: error.message
    });
  }
};

/**
 * Get doctor feedback analytics (for doctor dashboard)
 * GET /api/doctor/:id/feedback-analytics
 */
const getDoctorFeedbackAnalytics = async (req, res) => {
  try {
    const { id: doctor_id } = req.params;
    const requestingDoctorId = req.user?.doctorId || req.query.doctorId;

    // Security: Doctor can only view their own analytics
    if (requestingDoctorId && requestingDoctorId.toString() !== doctor_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only view your own analytics'
      });
    }

    let analysis = await DoctorFeedbackAnalysis.findOne({
      doctor_id: new mongoose.Types.ObjectId(doctor_id)
    }).lean();

    if (!analysis) {
      // Build analytics on-demand if not yet computed
      await updateDoctorFeedbackAnalysis(doctor_id);
      analysis = await DoctorFeedbackAnalysis.findOne({
        doctor_id: new mongoose.Types.ObjectId(doctor_id)
      }).lean();
    }

    if (!analysis) {
      return res.json({
        success: true,
        analytics: {
          average_rating: 0,
          total_feedback_count: 0,
          sentiment_summary: { positive: 0, neutral: 0, negative: 0 },
          age_demographics: {},
          gender_demographics: {
            male: 0,
            female: 0,
            other: 0,
            'prefer not to say': 0
          },
          last_updated: new Date()
        }
      });
    }

    res.json({
      success: true,
      analytics: {
        average_rating: analysis.average_rating,
        total_feedback_count: analysis.total_feedback_count,
        sentiment_summary: analysis.sentiment_summary,
        age_demographics: analysis.age_demographics || {},
        gender_demographics: analysis.gender_demographics || {
          male: 0,
          female: 0,
          other: 0,
          'prefer not to say': 0
        },
        last_updated: analysis.last_updated
      }
    });
  } catch (error) {
    console.error('Error getting doctor feedback analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback analytics',
      error: error.message
    });
  }
};

/**
 * Get doctor feedback list (anonymous, paginated)
 * GET /api/doctor/:id/feedback-list
 */
const getDoctorFeedbackList = async (req, res) => {
  try {
    const { id: doctor_id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const requestingDoctorId = req.user?.doctorId || req.query.doctorId;

    // Security: Doctor can only view their own feedback
    if (requestingDoctorId && requestingDoctorId.toString() !== doctor_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only view your own feedback'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const feedbacks = await PatientFeedback.find({
      doctor_id: new mongoose.Types.ObjectId(doctor_id)
    })
      .select('rating feedback_text sentiment_label sentiment_score sentimentStatus created_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await PatientFeedback.countDocuments({
      doctor_id: new mongoose.Types.ObjectId(doctor_id)
    });

    res.json({
      success: true,
      feedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting doctor feedback list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get feedback list',
      error: error.message
    });
  }
};

/**
 * Update doctor feedback analysis
 * Called after new feedback is submitted
 */
async function updateDoctorFeedbackAnalysis(doctor_id) {
  try {
    const doctorObjectId = new mongoose.Types.ObjectId(doctor_id);

    // Aggregate feedback data — only processed records contribute to analytics
    const feedbackData = await PatientFeedback.aggregate([
      { $match: { doctor_id: doctorObjectId, sentimentStatus: 'processed' } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: '$rating' },
          total_count: { $sum: 1 },
          sentiment_counts: {
            $push: '$sentiment_label'
          },
          age_data: {
            $push: { $cond: [{ $ne: ['$patient_age', null] }, '$patient_age', null] }
          },
          gender_data: {
            $push: '$patient_gender'
          }
        }
      }
    ]);

    if (feedbackData.length === 0) {
      // No feedback yet, create empty analysis
      await DoctorFeedbackAnalysis.findOneAndUpdate(
        { doctor_id: doctorObjectId },
        {
          doctor_id: doctorObjectId,
          average_rating: 0,
          total_feedback_count: 0,
          sentiment_summary: { positive: 0, neutral: 0, negative: 0 },
          age_demographics: {},
          gender_demographics: {
            male: 0,
            female: 0,
            other: 0,
            'prefer not to say': 0
          },
          last_updated: new Date()
        },
        { upsert: true, new: true }
      );
      return;
    }

    const data = feedbackData[0];
    
    // Calculate sentiment summary
    const sentimentSummary = {
      positive: data.sentiment_counts.filter(s => s === 'Positive').length,
      neutral: data.sentiment_counts.filter(s => s === 'Neutral').length,
      negative: data.sentiment_counts.filter(s => s === 'Negative').length
    };

    // Calculate age demographics
    const ageDemographics = {};
    data.age_data.forEach(age => {
      if (age !== null) {
        const ageGroup = getAgeGroup(age);
        ageDemographics[ageGroup] = (ageDemographics[ageGroup] || 0) + 1;
      }
    });

    // Calculate gender demographics
    const genderDemographics = {
      male: 0,
      female: 0,
      other: 0,
      'prefer not to say': 0
    };
    
    data.gender_data.forEach(gender => {
      if (gender) {
        const genderKey = gender.toLowerCase();
        if (genderDemographics.hasOwnProperty(genderKey)) {
          genderDemographics[genderKey]++;
        } else {
          genderDemographics.other++;
        }
      }
    });

    // Update or create analysis
    await DoctorFeedbackAnalysis.findOneAndUpdate(
      { doctor_id: doctorObjectId },
      {
        doctor_id: doctorObjectId,
        average_rating: Math.round(data.average_rating * 10) / 10,
        total_feedback_count: data.total_count,
        sentiment_summary: sentimentSummary,
        age_demographics: ageDemographics,
        gender_demographics: genderDemographics,
        last_updated: new Date()
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Updated feedback analysis for doctor ${doctor_id}`);
  } catch (error) {
    console.error(`❌ Error updating feedback analysis for doctor ${doctor_id}:`, error);
    // Don't throw - analytics update should not break feedback submission
  }
}

/**
 * Helper function to get age group
 * Groups: 18-25, 26-40, 41-60, 60+, Unknown
 */
function getAgeGroup(age) {
  if (!age || age < 18) return 'Unknown';
  if (age >= 18 && age <= 25) return '18-25';
  if (age >= 26 && age <= 40) return '26-40';
  if (age >= 41 && age <= 60) return '41-60';
  if (age > 60) return '60+';
  return 'Unknown';
}

module.exports = {
  submitFeedback,
  getPatientFeedbackHistory,
  getDoctorFeedbackSummary,
  getDoctorFeedbackAnalytics,
  getDoctorFeedbackList,
  updateDoctorFeedbackAnalysis
};

