// scripts/populate_sample_prescriptions.js
// Script to populate Patient_Prescription and E_Prescription collections with sample data
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const PatientPrescription = require('../models/PatientPrescriptionModel');
const EPrescription = require('../models/EPrescriptionModel');
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
    
    await mongoose.connect(MONGO_URI, {
      dbName: DATABASE_NAME
    });
    
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${DATABASE_NAME}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

async function populateSamplePrescriptions() {
  try {
    await connectDB();
    
    console.log('\n📋 Starting to populate sample prescriptions...\n');
    
    // Find specific patient by email
    const patientEmail = 'l227883@isb.nu.edu.pk';
    const doctorEmail = 'i222010@nu.edu.pk';
    
    console.log(`🔍 Looking for patient: ${patientEmail}`);
    const patient = await Patient.findOne({ emailAddress: patientEmail }).lean();
    
    if (!patient) {
      console.error(`❌ Patient with email ${patientEmail} not found.`);
      process.exit(1);
    }
    
    console.log(`🔍 Looking for doctor: ${doctorEmail}`);
    const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
    
    if (!doctor) {
      console.error(`❌ Doctor with email ${doctorEmail} not found.`);
      process.exit(1);
    }
    
    const patientId = patient._id;
    const doctorId = doctor._id;
    
    console.log(`✅ Found patient: ${patient.firstName || 'N/A'} ${patient.lastName || 'N/A'} (${patientId})`);
    console.log(`✅ Found doctor: ${doctor.DoctorName || doctor.name || 'N/A'} (${doctorId})`);
    
    // Find an appointment between this patient and doctor
    const appointment = await DocAppointment.findOne({
      patientId: patientId,
      doctorId: doctorId,
      status: { $in: ['completed', 'upcoming'] }
    }).lean();
    
    const appointmentId = appointment ? appointment._id : null;
    
    if (appointment) {
      console.log(`✅ Found appointment: ${appointmentId}\n`);
    } else {
      console.log(`⚠️  No appointment found between this patient and doctor. Prescriptions will be created without appointment link.\n`);
    }
    
    // Sample medications
    const sampleMedications = [
      { name: 'Amoxicillin', dosage: '500mg', frequency: '3 times/day', instructions: 'Take with food' },
      { name: 'Ibuprofen', dosage: '400mg', frequency: '2 times/day', instructions: 'Take after meals' },
      { name: 'Metformin', dosage: '500mg', frequency: '2 times/day', instructions: 'Take with breakfast and dinner' },
      { name: 'Aspirin', dosage: '81mg', frequency: '1 time/day', instructions: 'Take in the morning' },
      { name: 'Lisinopril', dosage: '10mg', frequency: '1 time/day', instructions: 'Take in the morning' }
    ];
    
    // Create sample regular prescriptions
    console.log('📝 Creating sample regular prescriptions...');
    const prescriptions = [];
    
    for (let i = 0; i < 5; i++) {
      const med = sampleMedications[i];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (i * 7)); // Stagger start dates
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // 2 weeks duration
      
      const reminders = [];
      if (med.frequency.includes('2')) {
        reminders.push({ time: '08:00', taken: false, skipped: false });
        reminders.push({ time: '20:00', taken: false, skipped: false });
      } else if (med.frequency.includes('3')) {
        reminders.push({ time: '08:00', taken: false, skipped: false });
        reminders.push({ time: '14:00', taken: false, skipped: false });
        reminders.push({ time: '20:00', taken: false, skipped: false });
      } else {
        reminders.push({ time: '08:00', taken: false, skipped: false });
      }
      
      // Add some adherence logs for older prescriptions
      const adherenceLog = [];
      if (i < 3) {
        for (let j = 0; j < 5; j++) {
          const logDate = new Date(startDate);
          logDate.setDate(logDate.getDate() + j);
          adherenceLog.push({
            date: logDate,
            time: reminders[0].time,
            taken: Math.random() > 0.2, // 80% adherence
            timestamp: new Date(logDate.getTime() + 8 * 60 * 60 * 1000) // 8 AM
          });
        }
      }
      
      const prescription = new PatientPrescription({
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: appointmentId || undefined,
        medicationName: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        instructions: med.instructions,
        startDate: startDate,
        endDate: endDate,
        isActive: endDate > new Date(),
        reminders: reminders,
        adherenceLog: adherenceLog,
        isDeleted: false
      });
      
      await prescription.save();
      prescriptions.push(prescription);
      console.log(`   ✅ Created prescription: ${med.name} (${med.dosage})`);
    }
    
    // Create sample e-prescriptions
    console.log('\n📄 Creating sample e-prescriptions...');
    
    for (let i = 0; i < 3; i++) {
      const medications = sampleMedications.slice(i, i + 2); // 2 medications per e-prescription
      
      const ePrescription = new EPrescription({
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: appointmentId || undefined,
        medications: medications,
        diagnosis: i === 0 ? 'Hypertension' : i === 1 ? 'Type 2 Diabetes' : 'Upper Respiratory Infection',
        notes: `E-prescription for ${medications.map(m => m.name).join(', ')}`,
        signedByDoctor: i < 2, // First 2 are signed
        signedAt: i < 2 ? new Date() : null,
        pdfUrl: i < 2 ? `/uploads/e-prescriptions/EPRESC_${doctorId}_${patientId}_${Date.now()}.pdf` : null,
        isDeleted: false
      });
      
      await ePrescription.save();
      console.log(`   ✅ Created e-prescription with ${medications.length} medications (signed: ${ePrescription.signedByDoctor})`);
    }
    
    console.log(`\n✅ Successfully created:`);
    console.log(`   - ${prescriptions.length} regular prescriptions`);
    console.log(`   - 3 e-prescriptions`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Active prescriptions: ${prescriptions.filter(p => p.isActive).length}`);
    console.log(`   - Past prescriptions: ${prescriptions.filter(p => !p.isActive).length}`);
    console.log(`   - Signed e-prescriptions: 2`);
    console.log(`   - Unsigned e-prescriptions: 1`);
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
populateSamplePrescriptions();

