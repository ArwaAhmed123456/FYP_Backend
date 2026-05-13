// Script to delete all completed appointments
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const DocAppointment = require('./models/DoctorAppointmentModel');
const connectDB = require('./config/db');

async function deleteCompletedAppointments() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Connected to MongoDB');

    // Delete all completed appointments
    console.log('\n🗑️ Deleting all completed appointments...');
    const result = await DocAppointment.deleteMany({ status: 'completed' });

    console.log(`✅ Successfully deleted ${result.deletedCount} completed appointment(s)\n`);
    
    // Close connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting completed appointments:', error);
    process.exit(1);
  }
}

// Run the script
deleteCompletedAppointments();

