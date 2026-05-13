require('dotenv').config({ path: '../.env' });
const { getCollection, connectToMongoDB, closeConnection } = require('./services/mongodb');

async function checkDoctorAppointments() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectToMongoDB();
    
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    // Count total appointments
    const totalCount = await appointmentsCollection.countDocuments();
    
    console.log('\n📊 Doctor_appointment Collection Status:');
    console.log(`   Total appointments: ${totalCount}`);
    
    if (totalCount === 0) {
      console.log('\n❌ Collection is EMPTY');
      return;
    }
    
    console.log('\n✅ Collection is NOT empty!');
    
    // Get some sample appointments
    const sampleAppointments = await appointmentsCollection.find({}).limit(5).toArray();
    
    console.log('\n📋 Sample appointments (first 5):');
    sampleAppointments.forEach((apt, index) => {
      const date = apt.appointment_date ? new Date(apt.appointment_date).toLocaleDateString() : 'N/A';
      const time = apt.appointment_time || 'N/A';
      console.log(`   ${index + 1}. Date: ${date} ${time} | Status: ${apt.status} | Type: ${apt.consultation_type}`);
      console.log(`      Patient ID: ${apt.patientId} | Doctor ID: ${apt.doctorId}`);
    });
    
    // Count by status
    const upcomingCount = await appointmentsCollection.countDocuments({ status: 'upcoming' });
    const completedCount = await appointmentsCollection.countDocuments({ status: 'completed' });
    const canceledCount = await appointmentsCollection.countDocuments({ status: 'canceled' });
    
    console.log('\n📈 Status Breakdown:');
    console.log(`   Upcoming: ${upcomingCount}`);
    console.log(`   Completed: ${completedCount}`);
    console.log(`   Canceled: ${canceledCount}`);
    
    // Count by consultation type
    const inPersonCount = await appointmentsCollection.countDocuments({ consultation_type: 'In-Person' });
    const videoCallCount = await appointmentsCollection.countDocuments({ consultation_type: 'Video Call' });
    
    console.log('\n📞 Consultation Types:');
    console.log(`   In-Person: ${inPersonCount}`);
    console.log(`   Video Call: ${videoCallCount}`);
    
  } catch (error) {
    console.error('❌ Error checking appointments:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closeConnection();
    console.log('\n🔌 Database connection closed.');
  }
}

// Run the script
checkDoctorAppointments()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to check appointments:', error);
    process.exit(1);
  });

