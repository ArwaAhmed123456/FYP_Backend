const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const PatientAppointmentActivity = require('./models/PatientAppointmentActivityModel');
const DoctorAppointmentActivity = require('./models/DoctorAppointmentActivityModel');
const { getCollection } = require('./services/mongodb');

async function verifyLinks() {
  try {
    await connectDB();
    
    const doctorId = new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    const patientsCollection = await getCollection('Patient');
    
    console.log('🔍 Verifying Appointment Links\n');
    console.log('='.repeat(70));
    
    // Get all medical records
    const medicalRecords = await PatientMedicalRecord.find({ doctorId: doctorId });
    console.log(`\n📋 Found ${medicalRecords.length} medical records\n`);
    
    let withAppointments = 0;
    let withoutAppointments = 0;
    let withActivities = 0;
    let withoutActivities = 0;
    
    for (let i = 0; i < medicalRecords.length; i++) {
      const record = medicalRecords[i];
      const patient = await patientsCollection.findOne({ _id: record.patientId });
      const patientName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Unknown';
      
      console.log(`\n📝 Record ${i + 1}: ${patientName}`);
      console.log(`   Medical Record ID: ${record._id.toString().substring(0, 8)}...`);
      
      if (record.appointmentId) {
        withAppointments++;
        const appointment = await appointmentsCollection.findOne({ _id: record.appointmentId });
        
        if (appointment) {
          console.log(`   ✅ Has Appointment ID: ${record.appointmentId.toString().substring(0, 8)}...`);
          console.log(`   Appointment Date: ${appointment.appointment_date || 'N/A'} ${appointment.appointment_time || 'N/A'}`);
          console.log(`   Status: ${appointment.status || 'N/A'}`);
          console.log(`   Type: ${appointment.consultation_type || appointment.type || 'N/A'}`);
          console.log(`   Has appointmentId field: ${appointment.appointmentId ? 'YES ✓' : 'NO'}`);
          console.log(`   Has appointment_date: ${appointment.appointment_date ? 'YES ✓' : 'NO'}`);
          console.log(`   Has appointment_time: ${appointment.appointment_time ? 'YES ✓' : 'NO'}`);
          console.log(`   Has booking_timestamp: ${appointment.booking_timestamp ? 'YES ✓' : 'NO'}`);
          
          // Check Patient_AppointmentActivity
          const patientActivity = await PatientAppointmentActivity.findOne({
            appointmentId: record.appointmentId.toString()
          });
          
          if (patientActivity) {
            withActivities++;
            console.log(`   ✅ Has Patient Activity: ${patientActivity.action} on ${patientActivity.appointmentDate?.toLocaleDateString() || 'N/A'}`);
          } else {
            withoutActivities++;
            console.log(`   ⚠️ No Patient Activity found`);
          }
        } else {
          console.log(`   ❌ Appointment not found in database`);
        }
      } else {
        withoutAppointments++;
        console.log(`   ⚠️ No Appointment ID linked`);
      }
    }
    
    // Check Doctor_AppointmentActivity
    console.log(`\n\n📅 Doctor_AppointmentActivity Records:`);
    const doctorActivities = await DoctorAppointmentActivity.find({
      doctorId: doctorId.toString()
    }).sort({ date: 1 });
    
    console.log(`   Found ${doctorActivities.length} activity records`);
    doctorActivities.forEach(activity => {
      console.log(`   - ${activity.date}: ${activity.bookedSlots} booked, ${activity.availableSlots} available (${activity.action})`);
    });
    
    // Summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 Verification Summary');
    console.log('='.repeat(70));
    console.log(`Total medical records: ${medicalRecords.length}`);
    console.log(`✅ With appointments: ${withAppointments}`);
    console.log(`⚠️ Without appointments: ${withoutAppointments}`);
    console.log(`✅ With patient activities: ${withActivities}`);
    console.log(`⚠️ Without patient activities: ${withoutActivities}`);
    console.log(`📅 Doctor activities: ${doctorActivities.length}`);
    console.log('='.repeat(70));
    
    if (withAppointments === medicalRecords.length && withActivities === withAppointments) {
      console.log('\n✅ All records properly linked!');
    } else {
      console.log('\n⚠️ Some records need attention');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyLinks();

