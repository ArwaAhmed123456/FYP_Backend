/**
 * Create Test Consultations for Feedback Testing
 * Creates enough consultations to support comprehensive feedback testing
 * Run with: node create_test_consultations.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { getCollection } = require('./services/mongodb');
const DoctorAppointment = require('./models/DoctorAppointmentModel');
const Patient = require('./models/PatientModel');
const Doctor = require('./models/DoctorModel');
const PatientFeedback = require('./models/PatientFeedbackModel');

// Real user emails from Tabeeb database
const PATIENT_EMAIL = process.env.TEST_PATIENT_EMAIL || 'l227883@isb.nu.edu.pk';
const DOCTOR_EMAIL = process.env.TEST_DOCTOR_EMAIL || 'i222010@nu.edu.pk';

// Number of consultations to create (enough for all test cases)
const NUM_CONSULTATIONS = 10;

// Test colors
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
  section: (msg) => console.log(`\n${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

async function createTestConsultations() {
  try {
    log.section('Creating Test Consultations for Feedback Testing');
    
    log.info('🔌 Connecting to database...');
    await connectDB();
    
    // Wait for connection to be ready
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 30000);
      });
    }
    
    log.success('Connected to database\n');

    // Find patient and doctor
    let patient, doctor;
    let TEST_PATIENT_ID, TEST_DOCTOR_ID;

    log.info(`👤 Finding patient: ${PATIENT_EMAIL}...`);
    try {
      patient = await Patient.findOne({ emailAddress: PATIENT_EMAIL });
    } catch (error) {
      log.warning('Mongoose query failed, trying native MongoDB driver...');
      const patientCollection = await getCollection('Patient');
      patient = await patientCollection.findOne({ emailAddress: PATIENT_EMAIL });
    }

    if (!patient) {
      log.error(`Patient with email ${PATIENT_EMAIL} not found in database`);
      log.info('💡 Available patients:');
      try {
        const patients = await Patient.find({}).limit(5).select('emailAddress firstName lastName');
        patients.forEach(p => {
          console.log(`   - ${p.emailAddress || 'No email'}: ${p.firstName} ${p.lastName}`);
        });
      } catch (error) {
        const patientCollection = await getCollection('Patient');
        const patients = await patientCollection.find({}).limit(5).toArray();
        patients.forEach(p => {
          console.log(`   - ${p.emailAddress || 'No email'}: ${p.firstName} ${p.lastName}`);
        });
      }
      process.exit(1);
    }
    
    TEST_PATIENT_ID = patient._id ? patient._id.toString() : patient._id.toString();
    log.success(`Found patient: ${patient.firstName} ${patient.lastName}`);
    log.info(`   Patient ID: ${TEST_PATIENT_ID}\n`);

    log.info(`👨‍⚕️ Finding doctor: ${DOCTOR_EMAIL}...`);
    try {
      doctor = await Doctor.findOne({ email: DOCTOR_EMAIL });
    } catch (error) {
      log.warning('Mongoose query failed, trying native MongoDB driver...');
      const doctorCollection = await getCollection('Doctor');
      doctor = await doctorCollection.findOne({ email: DOCTOR_EMAIL });
    }

    if (!doctor) {
      log.error(`Doctor with email ${DOCTOR_EMAIL} not found in database`);
      log.info('💡 Available doctors:');
      try {
        const doctors = await Doctor.find({}).limit(5).select('email DoctorName');
        doctors.forEach(d => {
          console.log(`   - ${d.email}: ${d.DoctorName}`);
        });
      } catch (error) {
        const doctorCollection = await getCollection('Doctor');
        const doctors = await doctorCollection.find({}).limit(5).toArray();
        doctors.forEach(d => {
          console.log(`   - ${d.email}: ${d.DoctorName}`);
        });
      }
      process.exit(1);
    }
    
    TEST_DOCTOR_ID = doctor._id ? doctor._id.toString() : doctor._id.toString();
    log.success(`Found doctor: ${doctor.DoctorName}`);
    log.info(`   Doctor ID: ${TEST_DOCTOR_ID}\n`);

    // Convert to ObjectIds
    const patientObjectId = mongoose.Types.ObjectId.isValid(TEST_PATIENT_ID) 
      ? new mongoose.Types.ObjectId(TEST_PATIENT_ID) 
      : TEST_PATIENT_ID;
    const doctorObjectId = mongoose.Types.ObjectId.isValid(TEST_DOCTOR_ID) 
      ? new mongoose.Types.ObjectId(TEST_DOCTOR_ID) 
      : TEST_DOCTOR_ID;

    // Check for existing consultations
    log.section('Checking Existing Consultations');
    
    let existingConsultations;
    try {
      existingConsultations = await DoctorAppointment.find({
        patientId: patientObjectId,
        doctorId: doctorObjectId,
        status: 'completed'
      }).sort({ appointmentDate: -1 }).lean();
    } catch (error) {
      log.warning('Mongoose query failed, trying native MongoDB driver...');
      const appointmentCollection = await getCollection('DoctorAppointment');
      existingConsultations = await appointmentCollection.find({
        patientId: patientObjectId,
        doctorId: doctorObjectId,
        status: 'completed'
      }).sort({ appointmentDate: -1 }).toArray();
    }

    // Check which consultations already have feedback
    log.info('Checking which consultations already have feedback...');
    const consultationIds = existingConsultations.map(c => c._id.toString());
    
    let consultationsWithFeedback = [];
    if (consultationIds.length > 0) {
      try {
        const feedbacks = await PatientFeedback.find({
          patient_id: patientObjectId,
          doctor_id: doctorObjectId,
          consultation_id: { $in: consultationIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).select('consultation_id').lean();
        
        consultationsWithFeedback = feedbacks.map(f => f.consultation_id.toString());
      } catch (error) {
        log.warning('Could not check existing feedback, will create new consultations');
      }
    }

    const consultationsWithoutFeedback = existingConsultations.filter(
      c => !consultationsWithFeedback.includes(c._id.toString())
    );

    log.info(`Found ${existingConsultations.length} existing completed consultations`);
    log.info(`  - ${consultationsWithFeedback.length} already have feedback`);
    log.info(`  - ${consultationsWithoutFeedback.length} available for feedback\n`);

    // Determine how many consultations we need to create
    const needed = NUM_CONSULTATIONS - consultationsWithoutFeedback.length;
    const consultationIdsToUse = [];

    // Use existing consultations without feedback first
    if (consultationsWithoutFeedback.length > 0) {
      log.info(`Using ${Math.min(consultationsWithoutFeedback.length, NUM_CONSULTATIONS)} existing consultations...`);
      consultationsWithoutFeedback.slice(0, NUM_CONSULTATIONS).forEach((consultation, i) => {
        consultationIdsToUse.push(consultation._id.toString());
        log.success(`  ${i + 1}. Using existing: ${consultation._id} (Date: ${new Date(consultation.appointmentDate).toLocaleDateString()})`);
      });
    }

    // Create new consultations if needed
    if (needed > 0) {
      log.section(`Creating ${needed} New Consultations`);
      
      const appointmentCollection = await getCollection('DoctorAppointment');
      const baseDate = new Date();
      
      for (let i = 0; i < needed; i++) {
        const consultationId = new mongoose.Types.ObjectId();
        const appointmentDate = new Date(baseDate.getTime() - (i * 24 * 60 * 60 * 1000)); // Different dates
        
        let consultation;
        try {
          // Try Mongoose first
          consultation = await DoctorAppointment.create({
            _id: consultationId,
            patientId: patientObjectId,
            doctorId: doctorObjectId,
            appointmentDate: appointmentDate,
            type: 'Video Call',
            status: 'completed',
            reason: `Test consultation ${consultationIdsToUse.length + i + 1} for feedback testing`,
          });
          log.success(`Created consultation ${consultationIdsToUse.length + i + 1}: ${consultationId}`);
        } catch (error) {
          // Fallback to native MongoDB
          try {
            await appointmentCollection.insertOne({
              _id: consultationId,
              patientId: patientObjectId,
              doctorId: doctorObjectId,
              appointmentDate: appointmentDate,
              type: 'Video Call',
              status: 'completed',
              reason: `Test consultation ${consultationIdsToUse.length + i + 1} for feedback testing`,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            consultation = { _id: consultationId };
            log.success(`Created consultation ${consultationIdsToUse.length + i + 1}: ${consultationId} (via native MongoDB)`);
          } catch (insertError) {
            log.error(`Failed to create consultation ${i + 1}: ${insertError.message}`);
            continue;
          }
        }
        
        consultationIdsToUse.push(consultationId.toString());
        
        // Small delay to ensure database consistency
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Final summary
    log.section('Test Consultations Summary');
    
    log.success(`Total consultations available for testing: ${consultationIdsToUse.length}`);
    log.info('\n📋 Consultation IDs:');
    consultationIdsToUse.forEach((id, i) => {
      log.info(`   ${i + 1}. ${id}`);
    });

    // Save to file
    const fs = require('fs');
    const testDataFile = './test_data_ids.json';
    const testData = {
      TEST_PATIENT_ID,
      TEST_DOCTOR_ID,
      TEST_CONSULTATION_ID: consultationIdsToUse[0],
      TEST_CONSULTATION_IDS: consultationIdsToUse
    };
    
    fs.writeFileSync(testDataFile, JSON.stringify(testData, null, 2));
    log.success(`\n💾 Test IDs saved to: ${testDataFile}`);

    // Display environment variables for easy copy-paste
    log.section('Environment Variables');
    console.log('You can set these environment variables:');
    console.log(`\n$env:TEST_PATIENT_ID="${TEST_PATIENT_ID}"`);
    console.log(`$env:TEST_DOCTOR_ID="${TEST_DOCTOR_ID}"`);
    console.log(`$env:TEST_CONSULTATION_ID="${consultationIdsToUse[0]}"`);
    console.log(`$env:TEST_CONSULTATION_IDS="${consultationIdsToUse.join(',')}"`);
    
    console.log('\nOr for bash/Linux:');
    console.log(`export TEST_PATIENT_ID="${TEST_PATIENT_ID}"`);
    console.log(`export TEST_DOCTOR_ID="${TEST_DOCTOR_ID}"`);
    console.log(`export TEST_CONSULTATION_ID="${consultationIdsToUse[0]}"`);
    console.log(`export TEST_CONSULTATION_IDS="${consultationIdsToUse.join(',')}"`);

    log.section('Next Steps');
    log.info('✅ Test consultations are ready!');
    log.info('💡 You can now run: node test_feedback_comprehensive.js');
    log.info('💡 The test script will automatically use the consultation IDs from test_data_ids.json');

    process.exit(0);
  } catch (error) {
    log.error(`Error creating test consultations: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
createTestConsultations();

