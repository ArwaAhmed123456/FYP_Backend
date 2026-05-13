/**
 * Populate Feedback Collections with Test Data
 * Creates consultations and feedback for:
 * - Doctor: i222010@nu.edu.pk
 * - Patient: l227883@isb.nu.edu.pk
 * 
 * Run with: node populate_feedback_data.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { getCollection } = require('./services/mongodb');
const PatientFeedback = require('./models/PatientFeedbackModel');
const DoctorFeedbackAnalysis = require('./models/DoctorFeedbackAnalysisModel');
const DoctorAppointment = require('./models/DoctorAppointmentModel');
const Patient = require('./models/PatientModel');
const Doctor = require('./models/DoctorModel');
const { analyzeSentiment } = require('./services/sentimentAnalysisService');

// Target users
const DOCTOR_EMAIL = 'i222010@nu.edu.pk';
const PATIENT_EMAIL = 'l227883@isb.nu.edu.pk';

// Test feedback samples with different sentiments and ratings
const feedbackSamples = [
  {
    text: 'The doctor was excellent! Very professional, knowledgeable, and took time to explain everything clearly. I felt completely satisfied with the consultation.',
    rating: 5,
    expectedSentiment: 'Positive'
  },
  {
    text: 'Great experience overall. The doctor was patient and answered all my questions. The consultation was thorough and helpful.',
    rating: 5,
    expectedSentiment: 'Positive'
  },
  {
    text: 'Good consultation. The doctor was professional and the advice was helpful. Nothing exceptional but satisfactory.',
    rating: 4,
    expectedSentiment: 'Positive'
  },
  {
    text: 'The consultation was okay. Nothing special, but it was fine. The doctor was polite and professional.',
    rating: 3,
    expectedSentiment: 'Neutral'
  },
  {
    text: 'Average experience. The doctor was decent but could have been more thorough. Consultation was acceptable.',
    rating: 3,
    expectedSentiment: 'Neutral'
  },
  {
    text: 'The consultation was mediocre. The doctor seemed rushed and didn\'t address all my concerns properly.',
    rating: 2,
    expectedSentiment: 'Negative'
  },
  {
    text: 'Terrible experience. The doctor was rude, unprofessional, and didn\'t listen to my concerns. Very disappointed with the service.',
    rating: 1,
    expectedSentiment: 'Negative'
  },
  {
    text: 'Excellent doctor! Very caring and understanding. Explained everything in detail and made me feel comfortable throughout the consultation.',
    rating: 5,
    expectedSentiment: 'Positive'
  },
  {
    text: 'The doctor was helpful and professional. Good consultation overall, though the wait time was a bit long.',
    rating: 4,
    expectedSentiment: 'Positive'
  },
  {
    text: 'Satisfactory consultation. The doctor was professional but the appointment felt rushed. Could have been better.',
    rating: 3,
    expectedSentiment: 'Neutral'
  },
  {
    text: 'Amazing doctor! Very knowledgeable and compassionate. Best consultation I\'ve had. Highly recommend!',
    rating: 5,
    expectedSentiment: 'Positive'
  },
  {
    text: 'The consultation was fine. Nothing outstanding, but the doctor was polite and the advice was reasonable.',
    rating: 3,
    expectedSentiment: 'Neutral'
  },
  {
    text: 'Poor experience. The doctor was dismissive and didn\'t take my symptoms seriously. Very unprofessional behavior.',
    rating: 2,
    expectedSentiment: 'Negative'
  },
  {
    text: 'Outstanding service! The doctor was exceptional - very thorough, patient, and provided excellent medical advice. Very satisfied!',
    rating: 5,
    expectedSentiment: 'Positive'
  },
  {
    text: 'The consultation was acceptable. The doctor was professional but the appointment was brief. Could use more detail.',
    rating: 3,
    expectedSentiment: 'Neutral'
  }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`),
};

async function populateFeedbackData() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('📊 POPULATING FEEDBACK COLLECTIONS WITH TEST DATA');
    console.log('='.repeat(80) + '\n');

    // Connect to database
    log.section('Connecting to database...');
    await connectDB();
    
    // Wait for connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
        setTimeout(resolve, 5000); // Timeout after 5 seconds
      });
    }
    
    log.success('Connected to database\n');

    // Find patient
    log.section('Finding patient...');
    let patient = await Patient.findOne({ emailAddress: PATIENT_EMAIL });
    if (!patient) {
      // Try native MongoDB
      const patientCollection = await getCollection('Patient');
      patient = await patientCollection.findOne({ emailAddress: PATIENT_EMAIL });
    }
    
    if (!patient) {
      log.error(`Patient with email ${PATIENT_EMAIL} not found`);
      process.exit(1);
    }
    
    const patientId = patient._id ? patient._id.toString() : patient._id;
    log.success(`Found patient: ${patient.firstName} ${patient.lastName}`);
    log.info(`Patient ID: ${patientId}\n`);

    // Find doctor
    log.section('Finding doctor...');
    let doctor = await Doctor.findOne({ email: DOCTOR_EMAIL });
    if (!doctor) {
      // Try native MongoDB
      const doctorCollection = await getCollection('Doctor');
      doctor = await doctorCollection.findOne({ email: DOCTOR_EMAIL });
    }
    
    if (!doctor) {
      log.error(`Doctor with email ${DOCTOR_EMAIL} not found`);
      process.exit(1);
    }
    
    const doctorId = doctor._id ? doctor._id.toString() : doctor._id;
    log.success(`Found doctor: ${doctor.DoctorName}`);
    log.info(`Doctor ID: ${doctorId}\n`);

    // Calculate patient age
    let patientAge = null;
    let patientGender = null;
    
    if (patient.Age) {
      // If Age is a date string
      if (typeof patient.Age === 'string' || patient.Age instanceof Date) {
        const birthDate = new Date(patient.Age);
        const today = new Date();
        patientAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          patientAge--;
        }
      } else if (typeof patient.Age === 'number') {
        patientAge = patient.Age;
      }
    }
    
    patientGender = patient.gender || null;

    log.info(`Patient Age: ${patientAge || 'Unknown'}, Gender: ${patientGender || 'Unknown'}\n`);

    // Create consultations and submit feedback
    log.section('Creating consultations and submitting feedback...');
    
    const appointmentCollection = await getCollection('DoctorAppointment');
    const createdFeedbacks = [];
    const createdConsultations = [];

    for (let i = 0; i < feedbackSamples.length; i++) {
      const feedback = feedbackSamples[i];
      
      try {
        // Create consultation
        const consultation = await appointmentCollection.insertOne({
          patientId: new mongoose.Types.ObjectId(patientId),
          doctorId: new mongoose.Types.ObjectId(doctorId),
          appointmentDate: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000)), // Different dates
          type: 'Video Call',
          status: 'completed',
          reason: `Consultation ${i + 1} for feedback testing`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        
        const consultationId = consultation.insertedId.toString();
        createdConsultations.push(consultationId);
        
        // Wait a moment for consultation to be available
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Analyze sentiment
        let sentimentResult;
        try {
          sentimentResult = await analyzeSentiment(feedback.text);
        } catch (error) {
          console.error(`Error analyzing sentiment: ${error.message}`);
          sentimentResult = {
            label: feedback.expectedSentiment,
            score: feedback.rating === 5 ? 0.8 : feedback.rating === 1 ? 0.2 : 0.5,
            confidence: 0.7
          };
        }
        
        // Create feedback
        const newFeedback = await PatientFeedback.create({
          patient_id: new mongoose.Types.ObjectId(patientId),
          doctor_id: new mongoose.Types.ObjectId(doctorId),
          consultation_id: new mongoose.Types.ObjectId(consultationId),
          rating: feedback.rating,
          feedback_text: feedback.text,
          sentiment_label: sentimentResult.label,
          sentiment_score: sentimentResult.score,
          patient_age: patientAge,
          patient_gender: patientGender,
          is_anonymous: true,
          created_at: new Date(),
        });
        
        createdFeedbacks.push(newFeedback._id);
        
        log.success(`Feedback ${i + 1}/${feedbackSamples.length}: Rating ${feedback.rating}, Sentiment: ${sentimentResult.label}`);
        
        // Small delay between submissions
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        log.error(`Failed to create feedback ${i + 1}: ${error.message}`);
        if (error.code === 11000) {
          log.warning('  Duplicate feedback detected (skipping)');
        }
      }
    }

    log.section('\nUpdating doctor feedback analysis...');
    
    // Update doctor feedback analysis
    const { updateDoctorFeedbackAnalysis } = require('./controller/feedbackController');
    await updateDoctorFeedbackAnalysis(doctorId);
    
    log.success('Doctor feedback analysis updated\n');

    // Display summary
    log.section('📊 POPULATION SUMMARY');
    console.log(`✅ Created ${createdConsultations.length} consultations`);
    console.log(`✅ Created ${createdFeedbacks.length} feedback entries`);
    console.log(`\n📋 Consultation IDs:`);
    createdConsultations.forEach((id, i) => {
      console.log(`   ${i + 1}. ${id}`);
    });
    
    // Get final analytics
    const analytics = await DoctorFeedbackAnalysis.findOne({ doctor_id: doctorId }).lean();
    if (analytics) {
      console.log(`\n📈 Final Analytics:`);
      console.log(`   Average Rating: ${analytics.average_rating.toFixed(2)}`);
      console.log(`   Total Feedback: ${analytics.total_feedback_count}`);
      console.log(`   Sentiment - Positive: ${analytics.sentiment_summary.positive}, Neutral: ${analytics.sentiment_summary.neutral}, Negative: ${analytics.sentiment_summary.negative}`);
      console.log(`   Age Demographics: ${JSON.stringify(analytics.age_demographics)}`);
      console.log(`   Gender Demographics: ${JSON.stringify(analytics.gender_demographics)}`);
    }

    console.log('\n' + '='.repeat(80));
    log.success('✅ Feedback data population complete!');
    console.log('='.repeat(80) + '\n');

    process.exit(0);
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run population
populateFeedbackData();

