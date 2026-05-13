// debug_followup_dates.js
// Debug script to check follow-up date values in the database

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const connectDB = require('./config/db');
const Patient = require('./models/PatientModel');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const Doctor = require('./models/DoctorModel');

async function debugFollowUpDates() {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    const doctor = await Doctor.findOne({ DoctorName: 'Nooran Ishtiaq Ahmed' });
    if (!doctor) {
      console.log('❌ Doctor not found');
      process.exit(1);
    }

    const records = await PatientMedicalRecord.find({
      doctorId: doctor._id
    }).populate('patientId').limit(10);

    console.log(`📋 Checking ${records.length} medical records:\n`);

    for (const record of records) {
      const patient = record.patientId;
      const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
      
      console.log(`Patient: ${patientName}`);
      console.log(`  Record ID: ${record._id}`);
      console.log(`  followUpDate value: ${record.followUpDate}`);
      console.log(`  followUpDate type: ${typeof record.followUpDate}`);
      console.log(`  followUpDate === null: ${record.followUpDate === null}`);
      console.log(`  followUpDate === undefined: ${record.followUpDate === undefined}`);
      console.log(`  !record.followUpDate: ${!record.followUpDate}`);
      
      if (record.followUpDate) {
        const date = new Date(record.followUpDate);
        console.log(`  Parsed date: ${date.toLocaleDateString()}`);
        console.log(`  Is valid date: ${!isNaN(date.getTime())}`);
      }
      
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugFollowUpDates();

