/**
 * Setup test data for feedback integration tests
 * Uses real users from Tabeeb database on Atlas
 * Run with: node setup_test_data.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { getCollection } = require('./services/mongodb');
const DoctorAppointment = require('./models/DoctorAppointmentModel');
const Patient = require('./models/PatientModel');
const Doctor = require('./models/DoctorModel');

// Real user emails from Tabeeb database
const PATIENT_EMAIL ='l227883@isb.nu.edu.pk';
const DOCTOR_EMAIL =  'i222010@nu.edu.pk';

async function setupTestData() {
  try {
    console.log('🔌 Connecting to Tabeeb database on Atlas...');
    await connectDB();
    
    // Wait for connection to be ready
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 30000);
      });
    }
    
    console.log('✅ Connected to database\n');

    // Try mongoose first, fallback to native MongoDB driver
    let patient, doctor;
    let TEST_PATIENT_ID, TEST_DOCTOR_ID;

    // Find real patient by email
    console.log(`👤 Finding patient: ${PATIENT_EMAIL}...`);
    try {
      patient = await Patient.findOne({ emailAddress: PATIENT_EMAIL });
    } catch (error) {
      console.log('⚠️  Mongoose query failed, trying native MongoDB driver...');
      const patientCollection = await getCollection('Patient');
      patient = await patientCollection.findOne({ emailAddress: PATIENT_EMAIL });
    }

    if (!patient) {
      console.error(`❌ Patient with email ${PATIENT_EMAIL} not found in database`);
      console.log('💡 Searching for patients...');
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
    console.log(`✅ Found patient: ${patient.firstName} ${patient.lastName}`);
    console.log(`   Patient ID: ${TEST_PATIENT_ID}\n`);

    // Find real doctor by email
    console.log(`👨‍⚕️ Finding doctor: ${DOCTOR_EMAIL}...`);
    try {
      doctor = await Doctor.findOne({ email: DOCTOR_EMAIL });
    } catch (error) {
      console.log('⚠️  Mongoose query failed, trying native MongoDB driver...');
      const doctorCollection = await getCollection('Doctor');
      doctor = await doctorCollection.findOne({ email: DOCTOR_EMAIL });
    }

    if (!doctor) {
      console.error(`❌ Doctor with email ${DOCTOR_EMAIL} not found in database`);
      console.log('💡 Searching for doctors...');
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
    console.log(`✅ Found doctor: ${doctor.DoctorName}`);
    console.log(`   Doctor ID: ${TEST_DOCTOR_ID}\n`);

    // Check for existing consultations between this patient and doctor
    console.log('📅 Checking for existing consultations...');
    let existingConsultations;
    const patientObjectId = mongoose.Types.ObjectId.isValid(TEST_PATIENT_ID) 
      ? new mongoose.Types.ObjectId(TEST_PATIENT_ID) 
      : TEST_PATIENT_ID;
    const doctorObjectId = mongoose.Types.ObjectId.isValid(TEST_DOCTOR_ID) 
      ? new mongoose.Types.ObjectId(TEST_DOCTOR_ID) 
      : TEST_DOCTOR_ID;
    
    try {
      existingConsultations = await DoctorAppointment.find({
        patientId: patientObjectId,
        doctorId: doctorObjectId,
        status: 'completed'
      }).sort({ appointmentDate: -1 }).limit(5);
    } catch (error) {
      console.log('⚠️  Mongoose query failed, trying native MongoDB driver...');
      const appointmentCollection = await getCollection('DoctorAppointment');
      existingConsultations = await appointmentCollection.find({
        patientId: patientObjectId,
        doctorId: doctorObjectId,
        status: 'completed'
      }).sort({ appointmentDate: -1 }).limit(5).toArray();
    }

    const consultationIds = [];

    if (existingConsultations.length > 0) {
      console.log(`✅ Found ${existingConsultations.length} existing completed consultations`);
      existingConsultations.forEach((consultation, i) => {
        consultationIds.push(consultation._id.toString());
        console.log(`   ${i + 1}. Consultation ID: ${consultation._id} (Date: ${consultation.appointmentDate})`);
      });
    } else {
      console.log('⚠️  No existing consultations found. Creating test consultations...');
      
      // Create test consultations with valid ObjectIds
      for (let i = 0; i < 5; i++) {
        // Generate a valid ObjectId (24 hex characters)
        const consultationId = new mongoose.Types.ObjectId();
        
        let consultation;
        try {
          consultation = await DoctorAppointment.create({
            _id: consultationId,
            patientId: patientObjectId,
            doctorId: doctorObjectId,
            appointmentDate: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)), // Different dates
            type: 'Video Call',
            status: 'completed',
            reason: `Test consultation ${i + 1} for feedback testing`,
          });
        } catch (error) {
          // Fallback to native MongoDB
          const appointmentCollection = await getCollection('DoctorAppointment');
          await appointmentCollection.insertOne({
            _id: consultationId,
            patientId: patientObjectId,
            doctorId: doctorObjectId,
            appointmentDate: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
            type: 'Video Call',
            status: 'completed',
            reason: `Test consultation ${i + 1} for feedback testing`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          consultation = { _id: consultationId };
        }
        consultationIds.push(consultationId.toString());
        console.log(`  ✅ Created consultation ${i + 1}: ${consultationId}`);
      }
    }

    console.log('\n✅ Test data setup complete!');
    console.log('\n📋 Test IDs (use these in .env or test script):');
    console.log(`   TEST_PATIENT_ID=${TEST_PATIENT_ID}`);
    console.log(`   TEST_DOCTOR_ID=${TEST_DOCTOR_ID}`);
    console.log(`   TEST_CONSULTATION_ID=${consultationIds[0]}`);
    console.log('\n📝 All Consultation IDs:');
    consultationIds.forEach((id, i) => {
      console.log(`   ${i + 1}. ${id}`);
    });
    console.log('\n💡 You can now run: node test_feedback_integration.js');
    console.log('\n💡 Or export these environment variables:');
    console.log(`   $env:TEST_PATIENT_ID="${TEST_PATIENT_ID}"`);
    console.log(`   $env:TEST_DOCTOR_ID="${TEST_DOCTOR_ID}"`);
    console.log(`   $env:TEST_CONSULTATION_ID="${consultationIds[0]}"`);
    console.log(`   $env:TEST_CONSULTATION_IDS="${consultationIds.join(',')}"`);
    
    // Write IDs to a file for the test script to read
    const fs = require('fs');
    const testDataFile = './test_data_ids.json';
    fs.writeFileSync(testDataFile, JSON.stringify({
      TEST_PATIENT_ID,
      TEST_DOCTOR_ID,
      TEST_CONSULTATION_ID: consultationIds[0],
      TEST_CONSULTATION_IDS: consultationIds
    }, null, 2));
    console.log(`\n💾 Test IDs saved to: ${testDataFile}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

setupTestData();

