const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const PatientAppointmentActivity = require('./models/PatientAppointmentActivityModel');
const DoctorAppointmentActivity = require('./models/DoctorAppointmentActivityModel');
const { getCollection } = require('./services/mongodb');

async function populateAppointments() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected\n');
    
    const doctorId = new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    // Get all medical records for this doctor
    console.log('📋 Fetching medical records...');
    const medicalRecords = await PatientMedicalRecord.find({ 
      doctorId: doctorId 
    });
    
    console.log(`✅ Found ${medicalRecords.length} medical records\n`);
    
    let appointmentsCreated = 0;
    let appointmentsLinked = 0;
    let activitiesCreated = 0;
    
    // Process each medical record
    for (let i = 0; i < medicalRecords.length; i++) {
      const record = medicalRecords[i];
      const patientId = record.patientId;
      
      if (!patientId) {
        console.log(`⚠️ Record ${i + 1}: No patient ID, skipping...`);
        continue;
      }
      
      // Get patient info from collection
      const patientsCollection = await getCollection('Patient');
      const patient = await patientsCollection.findOne({ _id: patientId });
      
      if (!patient) {
        console.log(`⚠️ Record ${i + 1}: Patient not found, skipping...`);
        continue;
      }
      
      const patientName = `${patient.firstName || patient.name || ''} ${patient.lastName || ''}`.trim() || 'Unknown Patient';
      
      // Check if record already has an appointment
      if (record.appointmentId) {
        const existingAppt = await DocAppointment.findById(record.appointmentId);
        if (existingAppt) {
          console.log(`✓ Record ${i + 1} (${patientName}): Already has appointment ${record.appointmentId.toString().substring(0, 8)}`);
          appointmentsLinked++;
          continue;
        }
      }
      
      // Create appointment date (mix of past, today, and future)
      const appointmentDate = new Date();
      let status = 'upcoming';
      
      if (i % 3 === 0) {
        // Past appointment (2-5 days ago)
        appointmentDate.setDate(appointmentDate.getDate() - (2 + Math.floor(Math.random() * 4)));
        appointmentDate.setHours(10 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 4) * 15, 0, 0);
        status = 'completed';
      } else if (i % 3 === 1) {
        // Today's appointment
        appointmentDate.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15, 0, 0);
        status = 'upcoming';
      } else {
        // Future appointment (1-14 days ahead)
        appointmentDate.setDate(appointmentDate.getDate() + (1 + Math.floor(Math.random() * 14)));
        appointmentDate.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15, 0, 0);
        status = 'upcoming';
      }
      
      // Extract date and time components
      const appointment_date = appointmentDate.toISOString().split('T')[0];
      const appointment_time = appointmentDate.toTimeString().split(' ')[0].substring(0, 5);
      const booking_timestamp = new Date();
      booking_timestamp.setDate(booking_timestamp.getDate() - Math.floor(Math.random() * 7)); // Booked 0-7 days ago
      
      // Determine consultation type based on record
      const consultationTypes = ['In-Person', 'Video Call', 'Follow-up'];
      const consultation_type = consultationTypes[Math.floor(Math.random() * consultationTypes.length)];
      
      // Create appointment using mongoose model first
      const newAppointment = await DocAppointment.create({
        doctorId: doctorId,
        patientId: patientId,
        appointmentDate: appointmentDate,
        type: consultation_type,
        status: status,
        reason: record.diagnosis || 'Routine consultation',
        notes: record.notes || `Appointment for ${patientName}`,
        location: 'Cardiology Department, Main Hospital'
      });
      
      // Update the appointment document with additional fields using native MongoDB
      await appointmentsCollection.updateOne(
        { _id: newAppointment._id },
        {
          $set: {
            appointmentId: newAppointment._id.toString(),
            appointment_date: appointment_date,
            appointment_time: appointment_time,
            booking_timestamp: booking_timestamp,
            consultation_type: consultation_type,
            reason_for_visit: record.diagnosis || 'Routine consultation',
            symptoms: record.symptoms && record.symptoms.length > 0 ? record.symptoms.join(', ') : '',
            diagnosis: record.diagnosis || '',
            medications: record.medications && record.medications.length > 0 ? record.medications.join(', ') : '',
            prescription_details: record.prescriptions && record.prescriptions.length > 0 ? record.prescriptions.join('; ') : '',
            duration_minutes: 30 + Math.floor(Math.random() * 30), // 30-60 minutes
            last_updated: new Date()
          }
        }
      );
      
      // Link appointment to medical record
      record.appointmentId = newAppointment._id;
      await record.save();
      
      // Create Patient_AppointmentActivity
      await PatientAppointmentActivity.create({
        patientId: patientId.toString(),
        appointmentId: newAppointment._id.toString(),
        doctorId: doctorId.toString(),
        action: 'booked',
        appointmentDate: appointmentDate,
        appointmentTime: appointment_time,
        consultationType: consultation_type,
        notes: `Appointment booked for ${patientName}`
      });
      
      // Create Doctor_AppointmentActivity for the appointment date
      const activityDate = appointment_date;
      const existingActivity = await DoctorAppointmentActivity.findOne({
        doctorId: doctorId.toString(),
        date: activityDate
      });
      
      if (!existingActivity) {
        await DoctorAppointmentActivity.create({
          doctorId: doctorId.toString(),
          date: activityDate,
          totalSlots: '8',
          bookedSlots: '1',
          availableSlots: '7',
          action: 'booked',
          notes: `Appointment booked for ${patientName}`
        });
      } else {
        // Update existing activity
        const bookedCount = parseInt(existingActivity.bookedSlots) + 1;
        const availableCount = Math.max(0, parseInt(existingActivity.availableSlots) - 1);
        existingActivity.bookedSlots = bookedCount.toString();
        existingActivity.availableSlots = availableCount.toString();
        await existingActivity.save();
      }
      
      appointmentsCreated++;
      activitiesCreated += 2; // Patient activity + Doctor activity
      
      console.log(`✓ Record ${i + 1} (${patientName}): Created appointment ${newAppointment._id.toString().substring(0, 8)} - ${appointment_date} ${appointment_time} (${status})`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Population Complete!');
    console.log('='.repeat(70));
    console.log(`📊 Summary:`);
    console.log(`   - Medical records processed: ${medicalRecords.length}`);
    console.log(`   - Appointments created: ${appointmentsCreated}`);
    console.log(`   - Appointments already linked: ${appointmentsLinked}`);
    console.log(`   - Activity records created: ${activitiesCreated}`);
    console.log(`   - Total appointments: ${appointmentsCreated + appointmentsLinked}`);
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

populateAppointments();

