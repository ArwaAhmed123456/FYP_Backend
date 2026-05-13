// Verify notifications are in the database
const mongoose = require('mongoose');
require('dotenv').config({ path: '../../.env' });

const Patient = require('../models/PatientModel');
const Doctor = require('../models/DoctorModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const DoctorNotificationModel = require('../models/DoctorNotificationModel');
const connectDB = require('../config/db');

async function verifyNotifications() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    const patientEmail = 'l227883@isb.nu.edu.pk';
    const doctorEmail = 'i222010@nu.edu.pk';

    const patient = await Patient.findOne({ emailAddress: patientEmail });
    const doctor = await Doctor.findOne({ email: doctorEmail });

    if (!patient || !doctor) {
      console.error('❌ Patient or doctor not found');
      process.exit(1);
    }

    console.log(`\n📊 Patient: ${patient.firstName} ${patient.lastName} (${patient._id})`);
    console.log(`📊 Doctor: ${doctor.DoctorName} (${doctor._id})`);

    // Get recent patient notifications
    console.log('\n📬 Recent Patient Notifications (last 10):');
    const patientNotifs = await PatientNotificationModel.getNotificationsByPatient(
      patient._id.toString(),
      10
    );
    const prescriptionNotifs = patientNotifs.filter(n => 
      n.type === 'prescription_created' || n.type === 'prescription_signed' || n.type === 'prescription_deleted'
    );
    console.log(`   Total prescription notifications: ${prescriptionNotifs.length}`);
    prescriptionNotifs.slice(0, 5).forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}`);
      console.log(`      Description: ${n.description.substring(0, 80)}...`);
      console.log(`      Created: ${n.createdAt}`);
      console.log(`      Read: ${n.read}`);
      console.log(`      ID: ${n._id}`);
    });

    // Get recent doctor notifications
    console.log('\n📬 Recent Doctor Notifications (last 10):');
    const doctorNotifs = await DoctorNotificationModel.getNotificationsByDoctor(
      doctor._id.toString(),
      10
    );
    const doctorPrescriptionNotifs = doctorNotifs.filter(n => 
      n.type === 'prescription_created' || n.type === 'prescription_signed' || n.type === 'prescription_deleted' ||
      n.type === 'e_prescription_created' || n.type === 'e_prescription_signed' || n.type === 'e_prescription_deleted'
    );
    console.log(`   Total prescription notifications: ${doctorPrescriptionNotifs.length}`);
    doctorPrescriptionNotifs.slice(0, 5).forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}`);
      console.log(`      Description: ${n.description.substring(0, 80)}...`);
      console.log(`      Created: ${n.createdAt}`);
      console.log(`      Read: ${n.read}`);
      console.log(`      ID: ${n._id}`);
    });

    console.log('\n✅ Verification complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyNotifications();

