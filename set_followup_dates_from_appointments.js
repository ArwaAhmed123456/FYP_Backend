// set_followup_dates_from_appointments.js
// Script to set follow-up dates for patients based on their upcoming appointments

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const connectDB = require('./config/db');
const Patient = require('./models/PatientModel');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const Doctor = require('./models/DoctorModel');

async function setFollowUpDates() {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    const doctor = await Doctor.findOne({ DoctorName: 'Nooran Ishtiaq Ahmed' });
    if (!doctor) {
      console.log('❌ Doctor not found');
      process.exit(1);
    }
    console.log(`👨‍⚕️ Using doctor: ${doctor.DoctorName} (${doctor._id})\n`);

    // Find patients without follow-up dates
    const patientsWithoutFollowUp = await Patient.find({
      $or: [
        { firstName: 'Zarmeena', lastName: 'Ali' },
        { firstName: 'Ariyana', lastName: 'Ahmed' }
      ]
    });

    console.log(`📋 Found ${patientsWithoutFollowUp.length} patients to update\n`);

    for (const patient of patientsWithoutFollowUp) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Patient: ${patient.firstName} ${patient.lastName} (${patient._id})`);
      console.log('='.repeat(70));

      // Find medical record
      const medicalRecord = await PatientMedicalRecord.findOne({
        patientId: patient._id,
        doctorId: doctor._id
      });

      if (!medicalRecord) {
        console.log('  ⚠️ No medical record found');
        continue;
      }

      console.log(`  Current Follow-up Date: ${medicalRecord.followUpDate || 'null'}`);
      console.log(`  Follow-up Required: ${medicalRecord.followUpRequired}`);

      // Find the next upcoming appointment for this patient-doctor pair
      const now = new Date();
      const upcomingAppointment = await DocAppointment.findOne({
        patientId: patient._id,
        doctorId: doctor._id,
        appointmentDate: { $gte: now },
        status: { $in: ['upcoming', 'pending_reschedule'] }
      })
      .sort({ appointmentDate: 1 }) // Earliest first
      .limit(1);

      if (upcomingAppointment) {
        console.log(`  📅 Found upcoming appointment: ${upcomingAppointment.appointmentDate.toLocaleDateString()}`);
        
        // Set follow-up date to the appointment date
        medicalRecord.followUpDate = upcomingAppointment.appointmentDate;
        medicalRecord.followUpRequired = true;
        await medicalRecord.save();
        
        console.log(`  ✅ Updated follow-up date to: ${medicalRecord.followUpDate.toLocaleDateString()}`);
      } else {
        // If no upcoming appointment, find the most recent appointment and set follow-up to 30 days later
        const lastAppointment = await DocAppointment.findOne({
          patientId: patient._id,
          doctorId: doctor._id
        })
        .sort({ appointmentDate: -1 })
        .limit(1);

        if (lastAppointment) {
          const followUpDate = new Date(lastAppointment.appointmentDate);
          followUpDate.setDate(followUpDate.getDate() + 30); // 30 days after last appointment
          
          console.log(`  📅 Last appointment: ${lastAppointment.appointmentDate.toLocaleDateString()}`);
          console.log(`  📅 Setting follow-up to 30 days later: ${followUpDate.toLocaleDateString()}`);
          
          medicalRecord.followUpDate = followUpDate;
          medicalRecord.followUpRequired = true;
          await medicalRecord.save();
          
          console.log(`  ✅ Updated follow-up date to: ${medicalRecord.followUpDate.toLocaleDateString()}`);
        } else {
          console.log(`  ⚠️ No appointments found for this patient`);
        }
      }
    }

    console.log('\n\n✅ Follow-up dates updated');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setFollowUpDates();

