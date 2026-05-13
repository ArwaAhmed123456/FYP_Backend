// scripts/populate_sample_medical_records.js
// Script to populate Patient Medical Record collection with sample data for timeline testing
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const PatientMedicalRecord = require('../models/PatientMedicalRecordModel');
const DocAppointment = require('../models/DoctorAppointmentModel');
const Patient = require('../models/PatientModel');
const Doctor = require('../models/DoctorModel');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';
    
    if (!MONGO_URI) {
      console.error('❌ MONGO_URI not found in environment variables');
      process.exit(1);
    }
    
    // Connect with explicit database name
    await mongoose.connect(MONGO_URI, {
      dbName: DATABASE_NAME
    });
    
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${DATABASE_NAME}`);
    console.log(`🔗 Connection: ${MONGO_URI.substring(0, 20)}...`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

async function populateSampleMedicalRecords() {
  try {
    await connectDB();
    
    console.log('\n📋 Starting to populate sample medical records...\n');
    
    // Debug: List available patients and doctors
    const allPatients = await Patient.find().limit(10).lean();
    const allDoctors = await Doctor.find().limit(10).lean();
    const allAppointments = await DocAppointment.find().limit(10).lean();
    
    console.log(`📊 Database Status:`);
    console.log(`   Patients: ${await Patient.countDocuments()}`);
    console.log(`   Doctors: ${await Doctor.countDocuments()}`);
    console.log(`   Appointments: ${await DocAppointment.countDocuments()}`);
    
    if (allPatients.length > 0) {
      console.log(`\n📋 Sample Patients (showing first ${allPatients.length}):`);
      allPatients.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.firstName || 'N/A'} ${p.lastName || 'N/A'} (${p._id})`);
      });
    }
    
    if (allDoctors.length > 0) {
      console.log(`\n👨‍⚕️ Sample Doctors (showing first ${allDoctors.length}):`);
      allDoctors.forEach((d, idx) => {
        console.log(`   ${idx + 1}. ${d.DoctorName || d.name || 'Unknown'} (${d._id})`);
      });
    }
    
    if (allAppointments.length > 0) {
      console.log(`\n📅 Sample Appointments (showing first ${allAppointments.length}):`);
      allAppointments.forEach((a, idx) => {
        const date = a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString() : 'No date';
        console.log(`   ${idx + 1}. Patient: ${a.patientId}, Doctor: ${a.doctorId}, Date: ${date}, Status: ${a.status}`);
      });
    }
    
    console.log('\n');
    
    // Allow patient ID to be passed as command line argument
    const patientIdArg = process.argv[2];
    const doctorIdArg = process.argv[3];
    
    let doctorId, patientId;
    let sampleDoctor, samplePatient;
    
    // If patient ID provided, use it; otherwise find any patient
    if (patientIdArg) {
      patientId = new mongoose.Types.ObjectId(patientIdArg);
      samplePatient = await Patient.findById(patientId);
      
      if (!samplePatient) {
        console.error(`❌ Patient with ID ${patientIdArg} not found.`);
        process.exit(1);
      }
      
      console.log(`✅ Found patient: ${samplePatient.firstName} ${samplePatient.lastName} (${patientId})`);
    } else {
      // Try to find a patient with appointments first
      const patientWithAppointment = await DocAppointment.findOne()
        .populate('patientId')
        .lean();
      
      if (patientWithAppointment && patientWithAppointment.patientId) {
        patientId = patientWithAppointment.patientId._id || patientWithAppointment.patientId;
        samplePatient = await Patient.findById(patientId);
        
        if (samplePatient) {
          console.log(`✅ Found patient with appointments: ${samplePatient.firstName} ${samplePatient.lastName} (${patientId})`);
        }
      }
      
      // If no patient with appointments, just find any patient
      if (!samplePatient) {
        console.log('ℹ️  No patients with appointments found. Looking for any patient...');
        samplePatient = await Patient.findOne();
        
        if (!samplePatient) {
          console.error('❌ No patients found in database. Please create at least one patient first.');
          process.exit(1);
        }
        
        patientId = samplePatient._id;
        console.log(`✅ Found patient: ${samplePatient.firstName} ${samplePatient.lastName} (${patientId})`);
        console.log('⚠️  Note: This patient has no appointments. Medical records will be created without appointment links.');
      }
    }
    
    // If doctor ID provided, use it; otherwise find any doctor
    if (doctorIdArg) {
      doctorId = new mongoose.Types.ObjectId(doctorIdArg);
      sampleDoctor = await Doctor.findById(doctorId);
      
      if (!sampleDoctor) {
        console.error(`❌ Doctor with ID ${doctorIdArg} not found.`);
        process.exit(1);
      }
      
      console.log(`✅ Found doctor: ${sampleDoctor.DoctorName || sampleDoctor.name || 'Unknown'} (${doctorId})`);
    } else {
      // Try to find a doctor who has appointments with this patient first
      const appointmentWithDoctor = await DocAppointment.findOne({
        patientId: patientId
      })
        .populate('doctorId')
        .lean();
      
      if (appointmentWithDoctor && appointmentWithDoctor.doctorId) {
        doctorId = appointmentWithDoctor.doctorId._id || appointmentWithDoctor.doctorId;
        sampleDoctor = await Doctor.findById(doctorId);
        
        if (sampleDoctor) {
          console.log(`✅ Found doctor with appointments: ${sampleDoctor.DoctorName || sampleDoctor.name || 'Unknown'} (${doctorId})`);
        }
      }
      
      // If no doctor with appointments, just find any doctor
      if (!sampleDoctor) {
        console.log('ℹ️  No doctor found with appointments for this patient. Looking for any doctor...');
        sampleDoctor = await Doctor.findOne();
        
        if (!sampleDoctor) {
          console.error('❌ No doctors found in database. Please create at least one doctor first.');
          process.exit(1);
        }
        
        doctorId = sampleDoctor._id;
        console.log(`✅ Found doctor: ${sampleDoctor.DoctorName || sampleDoctor.name || 'Unknown'} (${doctorId})`);
        console.log('⚠️  Note: This doctor has no appointments with this patient. Medical records will be created without appointment links.');
      }
    }
    
    // Verify patient data exists
    if (!samplePatient.firstName || !samplePatient.lastName) {
      console.warn('⚠️  Patient has incomplete name data, but continuing...');
    }
    
    console.log(`\n📋 Patient Details:`);
    console.log(`   Name: ${samplePatient.firstName || 'N/A'} ${samplePatient.lastName || 'N/A'}`);
    console.log(`   Email: ${samplePatient.emailAddress || 'N/A'}`);
    console.log(`   Phone: ${samplePatient.phone || 'N/A'}`);
    console.log(`   Age: ${samplePatient.Age || 'N/A'}`);
    console.log(`   Gender: ${samplePatient.gender || 'N/A'}\n`);
    
    // Get existing appointments for this doctor-patient pair
    const existingAppointments = await DocAppointment.find({
      doctorId: doctorId,
      patientId: patientId
    })
    .sort({ appointmentDate: -1 })
    .limit(10);
    
    console.log(`📋 Found ${existingAppointments.length} existing appointments for this doctor-patient pair\n`);
    
    if (existingAppointments.length === 0) {
      console.warn('⚠️  No appointments found. Medical records will be created without appointment links.\n');
    } else {
      console.log('📅 Available appointments:');
      existingAppointments.forEach((apt, idx) => {
        const aptDate = apt.appointmentDate ? new Date(apt.appointmentDate).toLocaleDateString() : 'No date';
        console.log(`   ${idx + 1}. ${aptDate} - ${apt.type || 'N/A'} - ${apt.status || 'N/A'}`);
      });
      console.log('');
    }
    
    // Sample medical record entries with varied data
    const sampleRecords = [
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: existingAppointments[0]?._id || null,
        diagnosis: 'Hypertension - Stage 1',
        symptoms: ['Headache', 'Dizziness', 'Fatigue'],
        medications: ['Lisinopril 10mg daily', 'Aspirin 81mg daily'],
        vaccinations: [],
        vitals: {
          bloodPressure: '140/90',
          heartRate: 78,
          temperature: 98.6,
          weight: 175,
          height: 70
        },
        allergies: ['Penicillin', 'Shellfish'],
        chronicConditions: ['Hypertension'],
        notes: 'Patient reports occasional headaches. Blood pressure elevated. Recommended lifestyle changes including reduced sodium intake and regular exercise. Prescribed Lisinopril.',
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        prescriptions: ['Lisinopril 10mg - Take once daily with food', 'Aspirin 81mg - Take once daily'],
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) // 45 days ago
      },
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: existingAppointments[1]?._id || null,
        diagnosis: 'Type 2 Diabetes - Well controlled',
        symptoms: ['Increased thirst', 'Frequent urination'],
        medications: ['Metformin 500mg twice daily', 'Glipizide 5mg daily'],
        vaccinations: ['Influenza 2024', 'COVID-19 Booster'],
        vitals: {
          bloodPressure: '128/82',
          heartRate: 72,
          temperature: 98.4,
          weight: 172,
          height: 70,
          bloodGlucose: 110
        },
        allergies: ['Penicillin'],
        chronicConditions: ['Type 2 Diabetes', 'Hypertension'],
        notes: 'Blood glucose levels well controlled. Patient reports good adherence to medication. A1C improved from 7.2% to 6.8%. Continue current medication regimen.',
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        prescriptions: ['Metformin 500mg - Take twice daily with meals', 'Glipizide 5mg - Take once daily before breakfast'],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      },
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: existingAppointments[2]?._id || null,
        diagnosis: 'Upper Respiratory Infection',
        symptoms: ['Cough', 'Sore throat', 'Nasal congestion', 'Fever'],
        medications: ['Amoxicillin 500mg three times daily', 'Ibuprofen 400mg as needed'],
        vaccinations: [],
        vitals: {
          bloodPressure: '120/80',
          heartRate: 88,
          temperature: 100.2,
          weight: 173,
          height: 70
        },
        allergies: ['Penicillin'],
        chronicConditions: [],
        notes: 'Patient presents with URI symptoms. No signs of bacterial infection initially, but symptoms persisted. Prescribed Amoxicillin. Advised rest and hydration.',
        followUpRequired: false,
        followUpDate: null,
        prescriptions: ['Amoxicillin 500mg - Take three times daily for 7 days', 'Ibuprofen 400mg - Take every 6-8 hours as needed for pain/fever'],
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
      },
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: existingAppointments[0]?._id || null,
        diagnosis: 'Annual Physical Examination - Normal',
        symptoms: [],
        medications: [],
        vaccinations: ['Tetanus-Diphtheria booster', 'Pneumococcal vaccine'],
        vitals: {
          bloodPressure: '118/76',
          heartRate: 68,
          temperature: 98.2,
          weight: 170,
          height: 70,
          bmi: 24.4
        },
        allergies: ['Penicillin', 'Shellfish'],
        chronicConditions: ['Hypertension', 'Type 2 Diabetes'],
        notes: 'Annual physical examination completed. All vitals within normal range. Patient is maintaining good health. Vaccinations updated. Continue current medication regimen.',
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        prescriptions: [],
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      },
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: existingAppointments[3]?._id || null,
        diagnosis: 'Follow-up: Hypertension Management',
        symptoms: ['Mild headache'],
        medications: ['Lisinopril 10mg daily', 'Aspirin 81mg daily'],
        vaccinations: [],
        vitals: {
          bloodPressure: '135/88',
          heartRate: 75,
          temperature: 98.5,
          weight: 174,
          height: 70
        },
        allergies: ['Penicillin', 'Shellfish'],
        chronicConditions: ['Hypertension'],
        notes: 'Follow-up visit for hypertension. Blood pressure slightly elevated but improved from previous visit. Patient reports better adherence to medication. Continue current treatment.',
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        prescriptions: ['Lisinopril 10mg - Continue current dosage', 'Aspirin 81mg - Continue current dosage'],
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
      },
      {
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: null, // No associated appointment
        diagnosis: 'Lab Results Review',
        symptoms: [],
        medications: [],
        vaccinations: [],
        vitals: {
          bloodPressure: '122/78',
          heartRate: 70,
          temperature: 98.3,
          weight: 171,
          height: 70
        },
        allergies: ['Penicillin', 'Shellfish'],
        chronicConditions: ['Hypertension', 'Type 2 Diabetes'],
        notes: 'Reviewed recent lab results. Cholesterol levels improved. Liver function tests normal. Blood glucose well controlled. No changes to treatment plan needed.',
        followUpRequired: false,
        followUpDate: null,
        prescriptions: [],
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      }
    ];
    
    // Check if records already exist to avoid duplicates
    const existingRecords = await PatientMedicalRecord.find({
      doctorId: doctorId,
      patientId: patientId
    });
    
    if (existingRecords.length > 0) {
      console.log(`⚠️  Found ${existingRecords.length} existing medical records for this doctor-patient pair.`);
      console.log('   Adding new records alongside existing ones...\n');
    } else {
      console.log('📝 No existing medical records found. Creating new ones...\n');
    }
    
    // Create medical records
    let createdCount = 0;
    for (const recordData of sampleRecords) {
      try {
        // Check if a similar record already exists (same date and doctor/patient)
        const existing = await PatientMedicalRecord.findOne({
          doctorId: recordData.doctorId,
          patientId: recordData.patientId,
          createdAt: {
            $gte: new Date(recordData.createdAt.getTime() - 24 * 60 * 60 * 1000),
            $lte: new Date(recordData.createdAt.getTime() + 24 * 60 * 60 * 1000)
          }
        });
        
        if (existing) {
          console.log(`⏭️  Skipping duplicate record for date: ${recordData.createdAt.toLocaleDateString()}`);
          continue;
        }
        
        const record = new PatientMedicalRecord(recordData);
        await record.save();
        createdCount++;
        console.log(`✅ Created medical record ${createdCount}/${sampleRecords.length}: ${recordData.diagnosis || 'No diagnosis'} (${recordData.createdAt.toLocaleDateString()})`);
      } catch (error) {
        console.error(`❌ Error creating medical record:`, error.message);
      }
    }
    
    console.log(`\n✅ Successfully created ${createdCount} medical records`);
    console.log(`📋 Total medical records for this doctor-patient pair: ${existingRecords.length + createdCount}\n`);
    
    // Verify the created records are properly linked
    console.log('🔍 Verifying created records...\n');
    const allRecords = await PatientMedicalRecord.find({
      doctorId: doctorId,
      patientId: patientId
    })
    .populate('patientId', 'firstName lastName')
    .populate('doctorId', 'DoctorName name')
    .sort({ createdAt: -1 })
    .limit(10);
    
    console.log(`✅ Verification: Found ${allRecords.length} total records linked to:`);
    allRecords.forEach((record, idx) => {
      const patientName = record.patientId?.firstName && record.patientId?.lastName 
        ? `${record.patientId.firstName} ${record.patientId.lastName}`
        : 'Unknown Patient';
      const doctorName = record.doctorId?.DoctorName || record.doctorId?.name || 'Unknown Doctor';
      const recordDate = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : 'No date';
      const hasAppointment = record.appointmentId ? 'Yes' : 'No';
      console.log(`   ${idx + 1}. ${recordDate} - Patient: ${patientName}, Doctor: ${doctorName}, Has Appointment: ${hasAppointment}`);
    });
    
    console.log('\n✅ Sample medical records populated successfully!');
    console.log('📋 You can now test the timeline feature in the Patient Details screen.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error populating sample medical records:', error);
    process.exit(1);
  }
}

// Run the script
populateSampleMedicalRecords();

