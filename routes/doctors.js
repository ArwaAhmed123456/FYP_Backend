const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getCollection } = require('../services/mongodb');
const DoctorFeedbackAnalysis = require('../models/DoctorFeedbackAnalysisModel');
const mongoose = require('mongoose');
const { getOrCreateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

// Fields with free-text content worth translating in the listing
const LIST_TRANSLATABLE_FIELDS = ['about', 'education'];

// Helper function to convert ObjectId to string
const convertObjectId = (doc) => {
  if (!doc) return doc;
  if (doc._id && doc._id.toString) {
    doc._id = doc._id.toString();
  }
  return doc;
};

// Get all doctors (public endpoint - no authentication required for patient app)
router.get('/', async (req, res) => {
  try {
    const { sort, userId } = req.query; // 'rating' to sort by rating; userId for language lookup
    const doctorsCollection = await getCollection('Doctor');
    
    // Find all doctors
    let doctors = await doctorsCollection.find({}).toArray();
    
    // If sorting by rating, join with feedback analysis
    if (sort === 'rating') {
      // Get all feedback analyses
      const feedbackAnalyses = await DoctorFeedbackAnalysis.find({}).lean();
      const ratingMap = new Map();
      
      feedbackAnalyses.forEach(analysis => {
        ratingMap.set(analysis.doctor_id.toString(), {
          average_rating: analysis.average_rating || 0,
          total_feedback_count: analysis.total_feedback_count || 0
        });
      });
      
      // Add rating info to doctors and sort
      doctors = doctors.map(doctor => {
        const doctorId = doctor._id.toString();
        const ratingInfo = ratingMap.get(doctorId) || {
          average_rating: 0,
          total_feedback_count: 0
        };
        
        return {
          ...doctor,
          average_rating: ratingInfo.average_rating,
          total_feedback_count: ratingInfo.total_feedback_count,
          has_ratings: ratingInfo.total_feedback_count > 0
        };
      });
      
      // Sort: doctors with ratings first (by rating desc), then doctors without ratings
      doctors.sort((a, b) => {
        const aHasRatings = a.has_ratings;
        const bHasRatings = b.has_ratings;
        
        if (aHasRatings && !bHasRatings) return -1;
        if (!aHasRatings && bHasRatings) return 1;
        if (aHasRatings && bHasRatings) {
          return b.average_rating - a.average_rating;
        }
        return 0; // Both have no ratings, maintain original order
      });
    }
    
    // Translate free-text fields for Urdu patients (before ObjectId conversion so cache key is consistent)
    const lang = await getPatientLanguage(userId);
    if (lang === 'ur') {
      doctors = await Promise.all(
        doctors.map(async (doctor) => {
          const fieldsToTranslate = {};
          for (const key of LIST_TRANSLATABLE_FIELDS) {
            if (typeof doctor[key] === 'string' && doctor[key].trim().length > 0) {
              fieldsToTranslate[key] = doctor[key];
            }
          }
          if (Object.keys(fieldsToTranslate).length === 0) return doctor;
          const translated = await getOrCreateTranslation('Doctor', doctor._id, fieldsToTranslate, lang);
          return { ...doctor, ...translated };
        })
      );
    }

    // Convert ObjectIds to strings
    const doctorsWithStringIds = doctors.map(convertObjectId);

    res.json(doctorsWithStringIds);
  } catch (error) {
    console.error('Get all doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

// Get doctor by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doctorsCollection = await getCollection('Doctor');
    
    // Try to find by ObjectId first, then by string _id
    let doctor;
    try {
      doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      // If ObjectId conversion fails, try as string
      doctor = await doctorsCollection.findOne({ _id: id });
    }
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    // Convert ObjectId to string
    const doctorWithStringId = convertObjectId(doctor);
    
    res.json(doctorWithStringId);
  } catch (error) {
    console.error('Get doctor by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor',
      error: error.message
    });
  }
});

// Get unique specializations (optional endpoint)
router.get('/specializations', async (req, res) => {
  try {
    const doctorsCollection = await getCollection('Doctor');
    
    // Get all doctors and extract unique specializations
    const doctors = await doctorsCollection.find({}).toArray();
    const specializations = new Set();
    
    doctors.forEach(doctor => {
      if (doctor.specialization && Array.isArray(doctor.specialization)) {
        doctor.specialization.forEach(spec => {
          if (spec && spec.trim()) {
            specializations.add(spec.trim());
          }
        });
      }
    });
    
    res.json(Array.from(specializations).sort());
  } catch (error) {
    console.error('Get specializations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch specializations',
      error: error.message
    });
  }
});

module.exports = router;

