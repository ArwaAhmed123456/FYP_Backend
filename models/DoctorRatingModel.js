const mongoose = require('mongoose');

const DoctorRatingSchema = new mongoose.Schema({
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
  comment: {
    type: String,
    default: '',
    maxlength: 1000
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  editedAt: {
    type: Date
  },
  isEdited: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'Doctor_Ratings'
});

// Compound index to ensure one rating per appointment
DoctorRatingSchema.index({ appointmentId: 1, patientId: 1 }, { unique: true });

// Index for doctor ratings lookup
DoctorRatingSchema.index({ doctorId: 1, timestamp: -1 });

// Method to check if rating can be edited (within 24 hours)
DoctorRatingSchema.methods.canEdit = function() {
  const now = new Date();
  const createdAt = this.timestamp;
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
  return hoursSinceCreation <= 24;
};

// Static method to calculate average rating for a doctor
DoctorRatingSchema.statics.calculateAverageRating = async function(doctorId) {
  const result = await this.aggregate([
    { $match: { doctorId: doctorId.toString() } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
        ratings: {
          $push: {
            rating: '$rating',
            timestamp: '$timestamp'
          }
        }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const data = result[0];
  
  // Calculate rating distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.ratings.forEach(r => {
    if (r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating]++;
    }
  });

  return {
    averageRating: Math.round(data.averageRating * 10) / 10, // Round to 1 decimal
    totalRatings: data.totalRatings,
    ratingDistribution: distribution
  };
};

const DoctorRatingModel = mongoose.model('DoctorRating', DoctorRatingSchema, 'Doctor_Ratings');

module.exports = DoctorRatingModel;

