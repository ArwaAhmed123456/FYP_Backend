// debug_specific_patients.js
// Debug script to check follow-up dates for specific patients

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const connectDB = require('./config/db');
const Patient = require('./models/PatientModel');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const Doctor = require('./models/DoctorModel');

async function debugSpecificPatients() {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    const doctor = await Doctor.findOne({ DoctorName: 'Nooran Ishtiaq Ahmed' });
    if (!doctor) {
      console.log('❌ Doctor not found');
      process.exit(1);
    }
    console.log(`👨‍⚕️ Using doctor: ${doctor.DoctorName} (${doctor._id})\n`);

    // Find the specific patients
    const patients = await Patient.find({
      $or: [
        { firstName: 'Zarmeena', lastName: 'Ali' },
        { firstName: 'Ariyana', lastName: 'Ahmed' }
      ]
    });

    console.log(`📋 Found ${patients.length} patients:\n`);

    for (const patient of patients) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Patient: ${patient.firstName} ${patient.lastName} (${patient._id})`);
      console.log('='.repeat(70));

      // Find medical records for this patient
      const medicalRecords = await PatientMedicalRecord.find({
        patientId: patient._id,
        doctorId: doctor._id
      });

      console.log(`\n📋 Medical Records (${medicalRecords.length}):`);
      for (const record of medicalRecords) {
        console.log(`\n  Record ID: ${record._id}`);
        console.log(`  Doctor ID: ${record.doctorId}`);
        console.log(`  Appointment ID: ${record.appointmentId || 'None'}`);
        console.log(`  Follow-up Required: ${record.followUpRequired}`);
        console.log(`  Follow-up Date: ${record.followUpDate || 'null'}`);
        console.log(`  Follow-up Date Type: ${typeof record.followUpDate}`);
        
        if (record.followUpDate) {
          const date = new Date(record.followUpDate);
          console.log(`  Parsed Date: ${date.toLocaleDateString()}`);
          console.log(`  Is Valid: ${!isNaN(date.getTime())}`);
        }
        
        console.log(`  Diagnosis: ${record.diagnosis || 'None'}`);
        console.log(`  Created At: ${record.createdAt}`);
        console.log(`  Updated At: ${record.updatedAt}`);
      }

      // Find appointments for this patient-doctor pair
      const appointments = await DocAppointment.find({
        patientId: patient._id,
        doctorId: doctor._id
      }).sort({ appointmentDate: -1 });

      console.log(`\n📅 Appointments (${appointments.length}):`);
      for (const appointment of appointments) {
        console.log(`\n  Appointment ID: ${appointment._id}`);
        console.log(`  Date: ${appointment.appointmentDate.toLocaleDateString()}`);
        console.log(`  Status: ${appointment.status}`);
        console.log(`  Type: ${appointment.type}`);
      }

      // Test the controller logic
      console.log(`\n🧪 Testing Controller Logic:`);
      const { getPatientWithMedicalRecord } = require('./controller/PatientDetailController');
      
      const req = {
        params: { id: patient._id.toString() },
        query: { doctorId: doctor._id.toString() }
      };
      
      const res = {
        data: null,
        statusCode: 200,
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.data = data;
          return this;
        }
      };

      await getPatientWithMedicalRecord(req, res);

      if (res.statusCode === 200 && res.data) {
        const medicalRecord = res.data.medicalRecord;
        if (medicalRecord) {
          console.log(`\n  ✅ Controller returned medical record:`);
          console.log(`     Record ID: ${medicalRecord._id}`);
          console.log(`     Follow-up Date: ${medicalRecord.followUpDate || 'null'}`);
          console.log(`     Follow-up Required: ${medicalRecord.followUpRequired || false}`);
        } else {
          console.log(`\n  ⚠️ Controller returned no medical record`);
        }
      } else {
        console.log(`\n  ❌ Controller error: Status ${res.statusCode}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugSpecificPatients();

