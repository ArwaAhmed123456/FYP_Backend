const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const DocAppointment = require('./models/DoctorAppointmentModel');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const { getCollection } = require('./services/mongodb');

async function updateAppointmentDates() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected\n');
    
    // Get doctor ID
    const doctorsCollection = await getCollection('Doctor');
    const doctor = await doctorsCollection.findOne({
      _id: new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b')
    });
    
    if (!doctor) {
      console.log('❌ Doctor not found');
      process.exit(1);
    }
    
    // Get medical records for this doctor
    const medicalRecords = await PatientMedicalRecord.find({ 
      doctorId: doctor._id 
    }).limit(10);
    
    console.log(`📋 Found ${medicalRecords.length} medical records\n`);
    console.log('📅 Updating appointment dates (setting some to past dates)...\n');
    
    // Update appointments - set first 3 to past dates, next 3 to today, rest to future
    for (let i = 0; i < medicalRecords.length; i++) {
      const record = medicalRecords[i];
      
      if (!record.appointmentId) continue;
      
      const appointment = await DocAppointment.findById(record.appointmentId);
      if (!appointment) continue;
      
      const newDate = new Date();
      
      if (i < 3) {
        // Past dates (3-7 days ago)
        newDate.setDate(newDate.getDate() - (3 + i));
        newDate.setHours(10, 0, 0, 0);
        console.log(`   Record ${i + 1}: Setting to ${newDate.toLocaleDateString()} (PAST)`);
      } else if (i < 6) {
        // Today
        newDate.setHours(10 + i, 0, 0, 0);
        console.log(`   Record ${i + 1}: Setting to ${newDate.toLocaleDateString()} ${newDate.toLocaleTimeString()} (TODAY)`);
      } else {
        // Future dates (3-10 days ahead)
        newDate.setDate(newDate.getDate() + (3 + (i - 6)));
        newDate.setHours(10, 0, 0, 0);
        console.log(`   Record ${i + 1}: Setting to ${newDate.toLocaleDateString()} (FUTURE)`);
      }
      
      appointment.appointmentDate = newDate;
      appointment.status = newDate < new Date() ? 'completed' : 'upcoming';
      await appointment.save();
    }
    
    console.log('\n✅ Appointment dates updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateAppointmentDates();

