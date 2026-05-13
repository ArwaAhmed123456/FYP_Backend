const express = require('express');
const router = express.Router();
const DoctorRatingModel = require('../models/DoctorRatingModel');
const DocPatientCallModel = require('../models/DocPatientCallModel');
const DocAppointment = require('../models/DoctorAppointmentModel');
const { getCollection } = require('../services/mongodb');

/**
 * POST /api/ratings
 * Submit a rating for a doctor (patient only)
 */
router.post('/', async (req, res) => {
  try {
    const { appointmentId, patientId, rating, comment } = req.body;

    // Validation
    if (!appointmentId || !patientId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: appointmentId, patientId, rating'
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5'
      });
    }

    // Verify appointment exists and belongs to patient
    const appointment = await DocAppointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (appointment.patientId.toString() !== patientId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This appointment does not belong to you'
      });
    }

    // Check if rating already exists
    const existingRating = await DoctorRatingModel.findOne({
      appointmentId: appointmentId.toString(),
      patientId: patientId.toString()
    });

    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'Rating already exists for this appointment. Use PUT to update it.'
      });
    }

    // For video/online: verify call has ended. For in-person: no call record required.
    const isInPerson = (appointment.type || '').toLowerCase().replace(/\s/g, '') === 'in-person';

    // In-person consultations: enforce 24-hour review window (from endTime or appointmentDate)
    if (isInPerson) {
      const windowStart = appointment.endTime || appointment.appointmentDate;
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

    if (!isInPerson) {
      const call = await DocPatientCallModel.findOne({ appointmentId: appointmentId.toString() });
      if (!call || call.status !== 'ended') {
        return res.status(400).json({
          success: false,
          message: 'Cannot submit rating: Consultation has not ended yet'
        });
      }
    }

    // Create rating and save to MongoDB Atlas
    const doctorRating = await DoctorRatingModel.create({
      doctorId: appointment.doctorId.toString(),
      patientId: patientId.toString(),
      appointmentId: appointmentId.toString(),
      rating,
      comment: comment || '',
      timestamp: new Date()
    });

    // Log successful save to MongoDB Atlas
    console.log('✅ Rating saved to MongoDB Atlas:', {
      ratingId: doctorRating._id,
      doctorId: doctorRating.doctorId,
      patientId: doctorRating.patientId,
      appointmentId: doctorRating.appointmentId,
      rating: doctorRating.rating,
      hasComment: !!doctorRating.comment,
      timestamp: doctorRating.timestamp,
      collection: 'Doctor_Ratings'
    });

    // Update doctor's average rating
    await updateDoctorRating(appointment.doctorId.toString());

    // Mark appointment as review submitted (hides "Submit Review" button, prevents duplicate flow)
    await DocAppointment.updateOne(
      { _id: appointment._id },
      { $set: { reviewSubmitted: true } }
    );

    res.json({
      success: true,
      message: 'Rating submitted successfully and saved to MongoDB Atlas',
      rating: doctorRating
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
      error: error.message
    });
  }
});

/**
 * PUT /api/ratings/:ratingId
 * Edit a rating (patient only, within 24 hours)
 */
router.put('/:ratingId', async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { patientId, rating, comment } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: patientId'
      });
    }

    // Find rating
    const doctorRating = await DoctorRatingModel.findById(ratingId);
    if (!doctorRating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    // Verify patient owns this rating
    if (doctorRating.patientId.toString() !== patientId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only edit your own ratings'
      });
    }

    // Check if rating can be edited (within 24 hours)
    if (!doctorRating.canEdit()) {
      return res.status(400).json({
        success: false,
        message: 'Rating cannot be edited: 24-hour editing window has expired'
      });
    }

    // Update rating
    if (rating !== undefined) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be an integer between 1 and 5'
        });
      }
      doctorRating.rating = rating;
    }

    if (comment !== undefined) {
      doctorRating.comment = comment || '';
    }

    doctorRating.isEdited = true;
    doctorRating.editedAt = new Date();
    
    // Save updated rating to MongoDB Atlas
    await doctorRating.save();

    // Log successful update to MongoDB Atlas
    console.log('✅ Rating updated in MongoDB Atlas:', {
      ratingId: doctorRating._id,
      doctorId: doctorRating.doctorId,
      patientId: doctorRating.patientId,
      appointmentId: doctorRating.appointmentId,
      rating: doctorRating.rating,
      hasComment: !!doctorRating.comment,
      editedAt: doctorRating.editedAt,
      isEdited: doctorRating.isEdited,
      collection: 'Doctor_Ratings'
    });

    // Update doctor's average rating
    await updateDoctorRating(doctorRating.doctorId);

    res.json({
      success: true,
      message: 'Rating updated successfully and saved to MongoDB Atlas',
      rating: doctorRating
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rating',
      error: error.message
    });
  }
});

/**
 * GET /api/ratings/doctor/:doctorId
 * Get all ratings for a doctor (public)
 */
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get ratings with pagination
    const ratings = await DoctorRatingModel.find({ doctorId: doctorId.toString() })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const totalRatings = await DoctorRatingModel.countDocuments({ doctorId: doctorId.toString() });

    // Get average rating and distribution
    const ratingStats = await DoctorRatingModel.calculateAverageRating(doctorId);

    res.json({
      success: true,
      ratings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRatings,
        pages: Math.ceil(totalRatings / parseInt(limit))
      },
      stats: ratingStats
    });
  } catch (error) {
    console.error('Error getting doctor ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ratings',
      error: error.message
    });
  }
});

/**
 * GET /api/ratings/appointment/:appointmentId
 * Get rating for a specific appointment
 */
router.get('/appointment/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { patientId } = req.query;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: patientId'
      });
    }

    const rating = await DoctorRatingModel.findOne({
      appointmentId: appointmentId.toString(),
      patientId: patientId.toString()
    });

    if (!rating) {
      return res.json({
        success: true,
        rating: null,
        canEdit: false
      });
    }

    res.json({
      success: true,
      rating,
      canEdit: rating.canEdit()
    });
  } catch (error) {
    console.error('Error getting appointment rating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rating',
      error: error.message
    });
  }
});

/**
 * GET /api/ratings/:ratingId
 * Get a specific rating by ID
 */
router.get('/:ratingId', async (req, res) => {
  try {
    const { ratingId } = req.params;
    const rating = await DoctorRatingModel.findById(ratingId);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    res.json({
      success: true,
      rating,
      canEdit: rating.canEdit()
    });
  } catch (error) {
    console.error('Error getting rating:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rating',
      error: error.message
    });
  }
});

/**
 * Helper function to update doctor's average rating
 * This updates the doctor's rating in the Doctor collection
 */
async function updateDoctorRating(doctorId) {
  try {
    const ratingStats = await DoctorRatingModel.calculateAverageRating(doctorId);
    
    // Update doctor's rating in Doctor collection
    const doctorCollection = await getCollection('Doctor');
    const { ObjectId } = require('mongodb');
    
    // Convert doctorId to ObjectId if it's a valid ObjectId string
    const doctorObjectId = ObjectId.isValid(doctorId) ? new ObjectId(doctorId) : doctorId;
    
    const updateResult = await doctorCollection.updateOne(
      { _id: doctorObjectId },
      {
        $set: {
          averageRating: ratingStats.averageRating,
          totalRatings: ratingStats.totalRatings,
          ratingDistribution: ratingStats.ratingDistribution,
          ratingUpdatedAt: new Date()
        }
      }
    );

    if (updateResult.matchedCount > 0) {
      console.log(`✅ Updated doctor ${doctorId} rating: ${ratingStats.averageRating} (${ratingStats.totalRatings} ratings)`);
    } else {
      console.warn(`⚠️ Doctor ${doctorId} not found in Doctor collection`);
    }
  } catch (error) {
    console.error(`Error updating doctor rating for ${doctorId}:`, error);
    // Don't throw - rating submission should still succeed even if update fails
  }
}

module.exports = router;

