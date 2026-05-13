const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = require('./config/db');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const Patient = require('./models/PatientModel');

async function fixAppointments() {
  await connectDB();
  
  const doctorId = new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b');
  
  // Find patients without appointments in their medical records
  const patients = await Patient.find({ 
    $or: [
      { firstName: 'Fatima', lastName: 'Ali' },
      { firstName: 'Muhammad', lastName: 'Hassan' }
    ]
  });
  
  console.log('Fixing missing appointments...\n');
  
  for (const patient of patients) {
    const record = await PatientMedicalRecord.findOne({ patientId: patient._id });
    
    if (record && !record.appointmentId) {
      // Find existing appointment for this patient-doctor pair
      let appointment = await DocAppointment.findOne({
        doctorId: doctorId,
        patientId: patient._id
      });
      
      // If no appointment exists, create one with past date
      if (!appointment) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - (patient.firstName === 'Fatima' ? 3 : 2));
        pastDate.setHours(10, 0, 0, 0);
        
        appointment = await DocAppointment.create({
          doctorId: doctorId,
          patientId: patient._id,
          appointmentDate: pastDate,
          type: 'In-Person',
          status: 'completed',
          reason: record.diagnosis || 'Follow-up',
          location: 'Cardiology Department'
        });
        
        console.log(`Created appointment for ${patient.firstName} ${patient.lastName}: ${pastDate.toLocaleDateString()}`);
      }
      
      // Link the appointment to the medical record
      record.appointmentId = appointment._id;
      await record.save();
      
      console.log(`Linked appointment to medical record for ${patient.firstName} ${patient.lastName}`);
    }
  }
  
  console.log('\n✅ Done!');
  process.exit(0);
}

fixAppointments();

