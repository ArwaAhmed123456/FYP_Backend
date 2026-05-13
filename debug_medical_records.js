const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const Patient = require('./models/PatientModel');

async function debug() {
  await connectDB();
  
  const patients = await Patient.find({ 
    $or: [
      { firstName: 'Fatima' },
      { firstName: 'Muhammad' },
      { firstName: 'Ahmad' }
    ]
  });
  
  console.log('Checking medical records for test patients:\n');
  
  for (const patient of patients) {
    const record = await PatientMedicalRecord.findOne({ patientId: patient._id });
    
    if (record) {
      console.log(`\n${patient.firstName} ${patient.lastName}:`);
      console.log(`  Medical Record ID: ${record._id}`);
      console.log(`  Appointment ID: ${record.appointmentId || 'NONE'}`);
      
      if (record.appointmentId) {
        const appointment = await DocAppointment.findById(record.appointmentId);
        if (appointment) {
          const now = new Date();
          const endOfDay = new Date(appointment.appointmentDate);
          endOfDay.setHours(23, 59, 59, 999);
          const isPast = now > endOfDay;
          
          console.log(`  Appointment Date: ${appointment.appointmentDate.toLocaleString()}`);
          console.log(`  Has Passed: ${isPast}`);
          console.log(`  Should be restricted: ${isPast ? 'YES' : 'NO'}`);
        } else {
          console.log(`  Appointment not found!`);
        }
      }
    } else {
      console.log(`\n${patient.firstName} ${patient.lastName}: No medical record found`);
    }
  }
  
  process.exit(0);
}

debug();

