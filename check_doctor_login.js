// check_doctor_login.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Doctor = require('./models/DoctorModel');
const PendingDoctor = require('./models/PendingDoctorModel');

async function checkDoctor() {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';
    
    console.log('🔗 Connecting to MongoDB...');
    console.log('Database Name:', DATABASE_NAME);
    
    await mongoose.connect(MONGO_URI, {
      dbName: DATABASE_NAME, // Explicitly specify database name
    });
    console.log('✅ Connected to MongoDB');
    console.log('Database:', mongoose.connection.db.databaseName);
    
    const email = 'i222010@nu.edu.pk';
    
    // Check exact match
    const doctor = await Doctor.findOne({ email: email });
    const doctorLower = await Doctor.findOne({ email: email.toLowerCase() });
    
    // Check case-insensitive
    const doctorRegex = await Doctor.findOne({ 
      email: new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') 
    });
    
    // Check pending
    const pending = await PendingDoctor.findOne({ email: email });
    const pendingLower = await PendingDoctor.findOne({ email: email.toLowerCase() });
    
    console.log('\n🔍 Searching for doctor:', email);
    console.log('Exact match (Doctor):', doctor ? '✅ Found' : '❌ Not found');
    console.log('Lowercase match (Doctor):', doctorLower ? '✅ Found' : '❌ Not found');
    console.log('Case-insensitive (Doctor):', doctorRegex ? '✅ Found' : '❌ Not found');
    console.log('Exact match (Pending):', pending ? '✅ Found' : '❌ Not found');
    console.log('Lowercase match (Pending):', pendingLower ? '✅ Found' : '❌ Not found');
    
    // List all doctors
    const allDoctors = await Doctor.find({}).limit(10);
    const allPending = await PendingDoctor.find({}).limit(10);
    
    console.log('\n📊 Total Doctors (approved):', await Doctor.countDocuments({}));
    if (allDoctors.length > 0) {
      console.log('Sample doctors:');
      allDoctors.forEach(d => console.log(`  - ${d.email} | ${d.DoctorName || 'N/A'}`));
    }
    
    console.log('\n📊 Total Pending Doctors:', await PendingDoctor.countDocuments({}));
    if (allPending.length > 0) {
      console.log('Sample pending doctors:');
      allPending.forEach(d => console.log(`  - ${d.email} | ${d.DoctorName || 'N/A'}`));
    }
    
    // If found, show details
    if (doctor) {
      console.log('\n✅ Doctor found!');
      console.log('ID:', doctor._id);
      console.log('Name:', doctor.DoctorName);
      console.log('Email:', doctor.email);
      console.log('Status:', doctor.status);
    } else if (pending) {
      console.log('\n⚠️ Doctor found in pending list!');
      console.log('ID:', pending._id);
      console.log('Name:', pending.DoctorName);
      console.log('Email:', pending.email);
      console.log('Status:', pending.status);
    } else {
      console.log('\n❌ Doctor not found in either collection');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDoctor();

