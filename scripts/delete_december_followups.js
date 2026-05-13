// scripts/delete_december_followups.js
// Script to delete Patient Medical Record entries with follow-up dates in December
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const PatientMedicalRecord = require('../models/PatientMedicalRecordModel');

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
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

async function deleteDecemberFollowUps() {
  try {
    await connectDB();
    
    console.log('\n📋 Searching for Patient Medical Records with follow-up dates in December...\n');
    
    // Find all records with followUpDate in December (any year)
    // December is month 11 (0-indexed: 0=January, 11=December)
    const allRecords = await PatientMedicalRecord.find({
      followUpDate: { $exists: true, $ne: null }
    }).lean();
    
    console.log(`📊 Total records with followUpDate: ${allRecords.length}`);
    
    // Filter records where followUpDate is in December
    const decemberRecords = allRecords.filter(record => {
      if (!record.followUpDate) return false;
      try {
        const date = new Date(record.followUpDate);
        // Check if month is December (month index 11)
        return date.getMonth() === 11;
      } catch (e) {
        return false;
      }
    });
    
    console.log(`📅 Records with follow-up dates in December: ${decemberRecords.length}\n`);
    
    if (decemberRecords.length === 0) {
      console.log('✅ No records found with December follow-up dates. Nothing to delete.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Show what will be deleted
    console.log('📋 Records to be deleted:');
    decemberRecords.forEach((record, idx) => {
      const date = new Date(record.followUpDate);
      console.log(`   ${idx + 1}. Record ID: ${record._id}`);
      console.log(`      Patient ID: ${record.patientId}`);
      console.log(`      Doctor ID: ${record.doctorId || 'N/A'}`);
      console.log(`      Follow-up Date: ${date.toLocaleDateString()}`);
      console.log(`      Diagnosis: ${record.diagnosis || 'N/A'}`);
      console.log('');
    });
    
    // Delete the records
    console.log('🗑️  Deleting records...\n');
    
    let deletedCount = 0;
    for (const record of decemberRecords) {
      try {
        await PatientMedicalRecord.findByIdAndDelete(record._id);
        deletedCount++;
        console.log(`✅ Deleted record ${deletedCount}/${decemberRecords.length}: ${record._id}`);
      } catch (error) {
        console.error(`❌ Error deleting record ${record._id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Successfully deleted ${deletedCount} out of ${decemberRecords.length} records`);
    console.log(`📊 Remaining records with followUpDate: ${await PatientMedicalRecord.countDocuments({ followUpDate: { $exists: true, $ne: null } })}\n`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
deleteDecemberFollowUps();

