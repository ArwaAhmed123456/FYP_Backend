require('dotenv').config({ path: '../.env' });
const { getCollection, connectToMongoDB, closeConnection } = require('./services/mongodb');
const { ObjectId } = require('mongodb');

// Function to generate sample appointment data with relative dates
function generateSampleAppointments() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return [
    {
      appointment_date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      appointment_time: '09:00',
      status: 'upcoming',
      consultation_type: 'In-Person',
      reason_for_visit: 'Regular checkup and health assessment',
      symptoms: '',
      diagnosis: '',
      medications: '',
      prescription_details: '',
      duration_minutes: 30,
      cancellation_reason: '',
      notes: 'First time visit',
    },
    {
      appointment_date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      appointment_time: '10:30',
      status: 'upcoming',
      consultation_type: 'Video Call',
      reason_for_visit: 'Follow-up consultation',
      symptoms: 'Mild headache and fatigue',
      diagnosis: '',
      medications: '',
      prescription_details: '',
      duration_minutes: 20,
      cancellation_reason: '',
      notes: 'Patient prefers video consultation',
    },
    {
      appointment_date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      appointment_time: '14:00',
      status: 'completed',
      consultation_type: 'In-Person',
      reason_for_visit: 'Chest pain and shortness of breath',
      symptoms: 'Chest pain, shortness of breath, mild dizziness',
      diagnosis: 'Anxiety-related symptoms, recommend stress management',
      medications: 'Paracetamol 500mg as needed',
      prescription_details: 'Take one tablet every 6 hours if pain persists. Follow up in 2 weeks.',
      duration_minutes: 45,
      cancellation_reason: '',
      notes: 'Patient responded well to consultation. Advised lifestyle changes.',
    },
    {
      appointment_date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      appointment_time: '11:00',
      status: 'completed',
      consultation_type: 'In-Person',
      reason_for_visit: 'Annual health checkup',
      symptoms: 'No current symptoms',
      diagnosis: 'Overall health good, minor vitamin D deficiency',
      medications: 'Vitamin D supplements 1000 IU daily',
      prescription_details: 'Take one tablet daily with food for 3 months. Recheck levels after.',
      duration_minutes: 30,
      cancellation_reason: '',
      notes: 'Patient in good health. Recommended regular exercise.',
    },
    {
      appointment_date: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      appointment_time: '15:30',
      status: 'canceled',
      consultation_type: 'In-Person',
      reason_for_visit: 'Fever and body aches',
      symptoms: '',
      diagnosis: '',
      medications: '',
      prescription_details: '',
      duration_minutes: 30,
      cancellation_reason: 'Patient had to travel urgently',
      notes: 'Rescheduled for next week',
    },
    {
      appointment_date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      appointment_time: '09:30',
      status: 'upcoming',
      consultation_type: 'In-Person',
      reason_for_visit: 'Diabetes management follow-up',
      symptoms: 'Occasional dizziness, frequent urination',
      diagnosis: '',
      medications: '',
      prescription_details: '',
      duration_minutes: 40,
      cancellation_reason: '',
      notes: 'Regular diabetes monitoring appointment',
    },
    {
      appointment_date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      appointment_time: '13:00',
      status: 'upcoming',
      consultation_type: 'Video Call',
      reason_for_visit: 'Prescription refill consultation',
      symptoms: '',
      diagnosis: '',
      medications: '',
      prescription_details: '',
      duration_minutes: 15,
      cancellation_reason: '',
      notes: 'Quick consultation for prescription renewal',
    },
    {
      appointment_date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      appointment_time: '16:00',
      status: 'completed',
      consultation_type: 'In-Person',
      reason_for_visit: 'Skin rash and itching',
      symptoms: 'Red rash on arms and legs, persistent itching',
      diagnosis: 'Allergic contact dermatitis',
      medications: 'Antihistamine tablets, topical corticosteroid cream',
      prescription_details: 'Take one antihistamine tablet twice daily. Apply cream to affected areas twice daily for 1 week.',
      duration_minutes: 25,
      cancellation_reason: '',
      notes: 'Patient advised to avoid suspected allergens',
    },
  ];
}

async function populateDoctorAppointments() {
  let client = null;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectToMongoDB();
    
    const doctorsCollection = await getCollection('Doctor');
    const patientsCollection = await getCollection('Patient');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    // Find doctor by name
    console.log('\n👨‍⚕️ Searching for doctor: Nooran Ishtiaq Ahmed...');
    const doctor = await doctorsCollection.findOne({
      $or: [
        { DoctorName: 'Nooran Ishtiaq Ahmed' },
        { DoctorName: { $regex: /Nooran.*Ishtiaq.*Ahmed/i } },
        { name: 'Nooran Ishtiaq Ahmed' },
        { firstName: 'Nooran', lastName: 'Ishtiaq Ahmed' },
        { firstName: 'Nooran', middleName: 'Ishtiaq', lastName: 'Ahmed' },
        { 'name': { $regex: /Nooran.*Ishtiaq.*Ahmed/i } },
      ]
    });
    
    if (!doctor) {
      console.log('❌ Doctor "Nooran Ishtiaq Ahmed" not found in Doctor collection.');
      console.log('\n📋 Available doctors:');
      const allDoctors = await doctorsCollection.find({}).limit(10).toArray();
      allDoctors.forEach((doc, index) => {
        const name = doc.DoctorName || doc.name || `${doc.firstName || ''} ${doc.middleName || ''} ${doc.lastName || ''}`.trim() || 'No name';
        console.log(`   ${index + 1}. ${name} (ID: ${doc._id})`);
      });
      return;
    }
    
    const doctorId = doctor._id;
    const doctorName = doctor.DoctorName || doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
    console.log(`✅ Found doctor: ${doctorName}`);
    console.log(`   Doctor ID: ${doctorId}`);
    
    // Get existing patients
    console.log('\n👥 Fetching existing patients...');
    const patients = await patientsCollection.find({ 
      isActive: { $in: ['true', true] } 
    }).limit(20).toArray();
    
    if (patients.length === 0) {
      console.log('❌ No active patients found in Patient collection.');
      return;
    }
    
    console.log(`✅ Found ${patients.length} active patient(s)`);
    
    // Check if appointments already exist for this doctor
    const existingAppointments = await appointmentsCollection.countDocuments({ doctorId: doctorId });
    if (existingAppointments > 0) {
      console.log(`\n⚠️  Warning: ${existingAppointments} appointment(s) already exist for this doctor.`);
      console.log('   The script will add new appointments. Existing appointments will not be deleted.');
    }
    
    // Create appointments
    console.log('\n📅 Creating appointments...');
    const appointmentsToInsert = [];
    const now = new Date();
    const sampleAppointments = generateSampleAppointments();
    
    for (let i = 0; i < sampleAppointments.length && i < patients.length; i++) {
      const sample = sampleAppointments[i];
      const patient = patients[i];
      
      // Generate appointment ID
      const appointmentId = new ObjectId().toString();
      
      // Calculate booking timestamp (before appointment date)
      const bookingTimestamp = new Date(sample.appointment_date);
      bookingTimestamp.setDate(bookingTimestamp.getDate() - Math.floor(Math.random() * 7) - 1);
      
      const appointment = {
        appointmentId: appointmentId,
        doctorId: doctorId,
        patientId: patient._id,
        appointment_date: sample.appointment_date,
        appointment_time: sample.appointment_time,
        booking_timestamp: bookingTimestamp,
        status: sample.status,
        consultation_type: sample.consultation_type,
        reason_for_visit: sample.reason_for_visit,
        symptoms: sample.symptoms,
        diagnosis: sample.diagnosis,
        medications: sample.medications,
        prescription_details: sample.prescription_details,
        duration_minutes: sample.duration_minutes,
        cancellation_reason: sample.cancellation_reason,
        notes: sample.notes,
        last_updated: now,
        createdAt: now,
        updatedAt: now,
      };
      
      appointmentsToInsert.push(appointment);
      
      const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
      console.log(`   ✓ Appointment ${i + 1}: ${sample.appointment_date.toLocaleDateString()} at ${sample.appointment_time} - ${patientName} (${sample.status})`);
    }
    
    // Insert appointments
    if (appointmentsToInsert.length > 0) {
      const result = await appointmentsCollection.insertMany(appointmentsToInsert);
      console.log(`\n✅ Successfully created ${result.insertedCount} appointment(s)!`);
      
      // Display summary
      console.log('\n📊 Summary:');
      const statusCounts = {
        upcoming: appointmentsToInsert.filter(a => a.status === 'upcoming').length,
        completed: appointmentsToInsert.filter(a => a.status === 'completed').length,
        canceled: appointmentsToInsert.filter(a => a.status === 'canceled').length,
      };
      console.log(`   Upcoming: ${statusCounts.upcoming}`);
      console.log(`   Completed: ${statusCounts.completed}`);
      console.log(`   Canceled: ${statusCounts.canceled}`);
      
      const typeCounts = {
        'In-Person': appointmentsToInsert.filter(a => a.consultation_type === 'In-Person').length,
        'Video Call': appointmentsToInsert.filter(a => a.consultation_type === 'Video Call').length,
      };
      console.log(`\n   Consultation Types:`);
      console.log(`   In-Person: ${typeCounts['In-Person']}`);
      console.log(`   Video Call: ${typeCounts['Video Call']}`);
      
      console.log(`\n🎉 Population completed successfully!`);
    } else {
      console.log('\n⚠️  No appointments to insert.');
    }
    
  } catch (error) {
    console.error('❌ Error populating appointments:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closeConnection();
    console.log('\n🔌 Database connection closed.');
  }
}

// Run the script
populateDoctorAppointments()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to populate appointments:', error);
    process.exit(1);
  });

