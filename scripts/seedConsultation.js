/**
 * Seed script: books a completed in-person consultation for a known patient/doctor pair
 * and creates the matching patient notifications.
 *
 * Patient : l227883@isb.nu.edu.pk
 * Doctor  : i222010@nu.edu.pk
 * Display time: 2:30 AM – 3:00 AM (April 18 2026)
 * endTime is always set to NOW so the 24-hour review window is always fresh.
 *
 * Run:          node scripts/seedConsultation.js
 * Reset+reseed: node scripts/seedConsultation.js --reset
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');

const Doctor  = require('../models/DoctorModel');
const Patient = require('../models/PatientModel');
const DocAppt = require('../models/DoctorAppointmentModel');

const RESET = process.argv.includes('--reset');

async function createNotification(patientId, apptId, doctor, notifType, title, description) {
  const col = await getCollection('Patient_Notifications');
  await col.insertOne({
    patientId:     new ObjectId(patientId.toString()),
    appointmentId: new ObjectId(apptId.toString()),
    type:          notifType,
    title,
    description,
    icon:          notifType === 'review_request' ? 'star-outline' : 'calendar-outline',
    read:          false,
    doctorName:    doctor.DoctorName || doctor.name || 'Doctor',
    timestamp:     new Date(),
    dateGroup:     'Today',
  });
  console.log(`   📬 Notification created: [${notifType}] ${title}`);
}

async function seed() {
  await connectDB();

  const doctor = await Doctor.findOne({ email: 'i222010@nu.edu.pk' });
  if (!doctor) { console.error('❌ Doctor i222010@nu.edu.pk not found'); process.exit(1); }

  const patient = await Patient.findOne({ emailAddress: 'l227883@isb.nu.edu.pk' });
  if (!patient) { console.error('❌ Patient l227883@isb.nu.edu.pk not found'); process.exit(1); }

  const doctorName  = doctor.DoctorName || 'Doctor';
  const patientName = `${patient.firstName} ${patient.lastName}`.trim();

  // Display time: 2:30 AM on April 18 2026 (shown to user)
  const appointmentDate = new Date('2026-04-18T02:30:00.000Z');

  // endTime = NOW so the 24-hour review window is always freshly open after seeding
  const endTime         = new Date();
  const reviewWindowEnd = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);

  // --reset: wipe old appointment + its notifications before re-creating
  const existing = await DocAppt.findOne({ doctorId: doctor._id, patientId: patient._id, appointmentDate });

  if (existing) {
    if (RESET) {
      await DocAppt.deleteOne({ _id: existing._id });
      const notifCol = await getCollection('Patient_Notifications');
      await notifCol.deleteMany({ appointmentId: new ObjectId(existing._id.toString()) });
      console.log('🗑️  Deleted existing appointment and its notifications (--reset)');
    } else {
      console.log('ℹ️  Appointment already exists:', existing._id.toString());
      console.log('   endTime stored:', existing.endTime);
      const existingWindowEnd = existing.endTime
        ? new Date(existing.endTime.getTime() + 24 * 60 * 60 * 1000)
        : null;
      if (existingWindowEnd && existingWindowEnd < new Date()) {
        console.log('⚠️  Review window has CLOSED. Run with --reset to refresh it.');
      } else {
        console.log('   Review window closes:', existingWindowEnd?.toISOString());
      }
      await mongoose.disconnect();
      return;
    }
  }

  const appt = await DocAppt.create({
    doctorId:         doctor._id,
    patientId:        patient._id,
    appointmentDate,
    endTime,
    type:             'In-Person',
    status:           'completed',
    reviewRequested:  true,
    reviewSubmitted:  false,
    reviewNotifiedAt: new Date(),
  });

  console.log('✅ Appointment created:', appt._id.toString());
  console.log('   Doctor :', doctorName, '/', doctor.email);
  console.log('   Patient:', patientName, '/', patient.emailAddress);
  console.log('   Display date:', appointmentDate.toISOString(), '(2:30 AM April 18)');
  console.log('   endTime (now):', endTime.toISOString());
  console.log('   Review window closes:', reviewWindowEnd.toISOString());

  await createNotification(
    patient._id, appt._id, doctor,
    'appointment_booked',
    'Appointment Confirmed',
    `Your in-person appointment with Dr. ${doctorName} on April 18 at 2:30 AM has been confirmed.`
  );

  await createNotification(
    patient._id, appt._id, doctor,
    'review_request',
    'How was your consultation?',
    `Please rate your in-person visit with Dr. ${doctorName}. You have 24 hours to submit a review.`
  );

  console.log('\n🎉 Seed complete. Open the Notifications tab to see the review request.');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
