const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const PatientAppointmentActivity = require('./models/PatientAppointmentActivityModel');
const DoctorAppointmentActivity = require('./models/DoctorAppointmentActivityModel');
const { getCollection } = require('./services/mongodb');

async function enhanceAppointments() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected\n');
    
    const doctorId = new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    const patientsCollection = await getCollection('Patient');
    
    // Get all medical records for this doctor
    console.log('📋 Fetching medical records with appointments...');
    const medicalRecords = await PatientMedicalRecord.find({ 
      doctorId: doctorId,
      appointmentId: { $ne: null }
    });
    
    console.log(`✅ Found ${medicalRecords.length} medical records with appointments\n`);
    
    let appointmentsEnhanced = 0;
    let activitiesCreated = 0;
    const appointmentDates = new Set(); // Track unique appointment dates for doctor activity
    
    // Process each medical record
    for (let i = 0; i < medicalRecords.length; i++) {
      const record = medicalRecords[i];
      const patientId = record.patientId;
      
      if (!patientId || !record.appointmentId) continue;
      
      // Get patient info
      const patient = await patientsCollection.findOne({ _id: patientId });
      const patientName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Unknown';
      
      // Get appointment
      const appointment = await DocAppointment.findById(record.appointmentId);
      if (!appointment) {
        console.log(`⚠️ Record ${i + 1} (${patientName}): Appointment not found`);
        continue;
      }
      
      // Extract date and time from appointmentDate
      const appointmentDate = new Date(appointment.appointmentDate);
      const appointment_date = appointmentDate.toISOString().split('T')[0];
      const appointment_time = appointmentDate.toTimeString().split(' ')[0].substring(0, 5);
      
      // Calculate booking timestamp (1-7 days before appointment)
      const booking_timestamp = new Date(appointmentDate);
      booking_timestamp.setDate(booking_timestamp.getDate() - (1 + Math.floor(Math.random() * 7)));
      
      // Update appointment with additional fields
      const updateData = {
        appointmentId: appointment._id.toString(),
        appointment_date: appointment_date,
        appointment_time: appointment_time,
        booking_timestamp: booking_timestamp,
        consultation_type: appointment.type || 'In-Person',
        reason_for_visit: appointment.reason || record.diagnosis || 'Routine consultation',
        symptoms: record.symptoms && record.symptoms.length > 0 ? record.symptoms.join(', ') : '',
        diagnosis: record.diagnosis || '',
        medications: record.medications && record.medications.length > 0 ? record.medications.join(', ') : '',
        prescription_details: record.prescriptions && record.prescriptions.length > 0 ? record.prescriptions.join('; ') : '',
        duration_minutes: 30 + Math.floor(Math.random() * 30), // 30-60 minutes
        last_updated: new Date()
      };
      
      // Only update if fields are missing
      const existingAppt = await appointmentsCollection.findOne({ _id: appointment._id });
      const needsUpdate = !existingAppt.appointmentId || !existingAppt.appointment_date;
      
      if (needsUpdate) {
        await appointmentsCollection.updateOne(
          { _id: appointment._id },
          { $set: updateData }
        );
        appointmentsEnhanced++;
        console.log(`✓ Enhanced appointment for ${patientName} (${appointment_date} ${appointment_time})`);
      }
      
      // Create or update Patient_AppointmentActivity
      const existingPatientActivity = await PatientAppointmentActivity.findOne({
        patientId: patientId.toString(),
        appointmentId: appointment._id.toString()
      });
      
      if (!existingPatientActivity) {
        await PatientAppointmentActivity.create({
          patientId: patientId.toString(),
          appointmentId: appointment._id.toString(),
          doctorId: doctorId.toString(),
          action: appointment.status === 'completed' ? 'booked' : 'booked',
          appointmentDate: appointmentDate,
          appointmentTime: appointment_time,
          consultationType: appointment.type || 'In-Person',
          notes: `Appointment ${appointment.status} for ${patientName}`
        });
        activitiesCreated++;
      }
      
      // Track appointment date for doctor activity
      appointmentDates.add(appointment_date);
    }
    
    // Create/update Doctor_AppointmentActivity for each unique date
    console.log('\n📅 Creating/updating Doctor_AppointmentActivity records...');
    let doctorActivitiesCreated = 0;
    let doctorActivitiesUpdated = 0;
    
    for (const date of appointmentDates) {
      const existingActivity = await DoctorAppointmentActivity.findOne({
        doctorId: doctorId.toString(),
        date: date
      });
      
      // Count appointments for this date
      const appointmentsForDate = await DocAppointment.countDocuments({
        doctorId: doctorId,
        appointmentDate: {
          $gte: new Date(date + 'T00:00:00.000Z'),
          $lt: new Date(date + 'T23:59:59.999Z')
        }
      });
      
      if (!existingActivity) {
        await DoctorAppointmentActivity.create({
          doctorId: doctorId.toString(),
          date: date,
          totalSlots: '8',
          bookedSlots: appointmentsForDate.toString(),
          availableSlots: Math.max(0, 8 - appointmentsForDate).toString(),
          action: 'booked',
          notes: `${appointmentsForDate} appointment(s) booked for this date`
        });
        doctorActivitiesCreated++;
        console.log(`  ✓ Created activity for ${date} (${appointmentsForDate} appointments)`);
      } else {
        // Update existing activity
        existingActivity.bookedSlots = appointmentsForDate.toString();
        existingActivity.availableSlots = Math.max(0, 8 - appointmentsForDate).toString();
        await existingActivity.save();
        doctorActivitiesUpdated++;
        console.log(`  ✓ Updated activity for ${date} (${appointmentsForDate} appointments)`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Enhancement Complete!');
    console.log('='.repeat(70));
    console.log(`📊 Summary:`);
    console.log(`   - Medical records processed: ${medicalRecords.length}`);
    console.log(`   - Appointments enhanced: ${appointmentsEnhanced}`);
    console.log(`   - Patient activities created: ${activitiesCreated}`);
    console.log(`   - Doctor activities created: ${doctorActivitiesCreated}`);
    console.log(`   - Doctor activities updated: ${doctorActivitiesUpdated}`);
    console.log(`   - Unique appointment dates: ${appointmentDates.size}`);
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

enhanceAppointments();

