const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

// Connect to MongoDB using mongoose
const connectDB = require('./config/db');

// Import models (after mongoose connection)
const Patient = require('./models/PatientModel');
const PatientMedicalRecord = require('./models/PatientMedicalRecordModel');
const DocAppointment = require('./models/DoctorAppointmentModel');
const { getCollection } = require('./services/mongodb');

// Sample medical record data templates
const medicalRecordTemplates = [
  {
    diagnosis: 'Hypertension Stage 2',
    symptoms: ['High blood pressure', 'Headaches', 'Dizziness', 'Chest pain'],
    medications: ['Lisinopril 10mg', 'Amlodipine 5mg', 'Hydrochlorothiazide 25mg'],
    vitals: {
      bloodPressure: '150/95',
      heartRate: 82,
      temperature: 98.6,
      weight: 75,
      height: 170
    },
    allergies: ['Penicillin', 'Sulfa drugs'],
    chronicConditions: ['Hypertension', 'Type 2 Diabetes'],
    notes: 'Patient shows elevated blood pressure readings. Prescribed ACE inhibitor and calcium channel blocker. Advised lifestyle modifications including low-sodium diet and regular exercise. Follow-up in 2 weeks.',
    followUpRequired: true,
    prescriptions: ['Lisinopril 10mg once daily', 'Amlodipine 5mg once daily']
  },
  {
    diagnosis: 'Acute Myocardial Infarction (STEMI)',
    symptoms: ['Severe chest pain', 'Shortness of breath', 'Nausea', 'Sweating'],
    medications: ['Aspirin 81mg', 'Clopidogrel 75mg', 'Atorvastatin 40mg', 'Metoprolol 50mg'],
    vitals: {
      bloodPressure: '140/90',
      heartRate: 95,
      temperature: 99.2,
      weight: 80,
      height: 175
    },
    allergies: ['Iodine contrast'],
    chronicConditions: ['Coronary Artery Disease', 'Hyperlipidemia'],
    notes: 'Patient presented with acute STEMI. Emergency PCI performed successfully. Stent placed in LAD. Patient stable post-procedure. Discharged on dual antiplatelet therapy. Critical follow-up required.',
    followUpRequired: true,
    prescriptions: ['Aspirin 81mg daily', 'Clopidogrel 75mg daily', 'Atorvastatin 40mg at bedtime']
  },
  {
    diagnosis: 'Atrial Fibrillation',
    symptoms: ['Irregular heartbeat', 'Palpitations', 'Fatigue', 'Shortness of breath'],
    medications: ['Warfarin 5mg', 'Metoprolol 25mg', 'Digoxin 0.25mg'],
    vitals: {
      bloodPressure: '130/85',
      heartRate: 110,
      temperature: 98.4,
      weight: 70,
      height: 168
    },
    allergies: [],
    chronicConditions: ['Atrial Fibrillation', 'Hypertension'],
    notes: 'Patient diagnosed with paroxysmal atrial fibrillation. Started on anticoagulation therapy. ECG shows irregular rhythm. Advised to monitor for signs of stroke. Regular INR monitoring required.',
    followUpRequired: true,
    prescriptions: ['Warfarin 5mg daily (INR monitoring)', 'Metoprolol 25mg twice daily']
  },
  {
    diagnosis: 'Congestive Heart Failure (NYHA Class II)',
    symptoms: ['Shortness of breath on exertion', 'Fatigue', 'Swollen ankles', 'Reduced exercise tolerance'],
    medications: ['Furosemide 40mg', 'Enalapril 10mg', 'Carvedilol 12.5mg', 'Spironolactone 25mg'],
    vitals: {
      bloodPressure: '125/80',
      heartRate: 88,
      temperature: 98.2,
      weight: 85,
      height: 172
    },
    allergies: ['ACE inhibitors (mild)'],
    chronicConditions: ['Heart Failure', 'Diabetes', 'Chronic Kidney Disease'],
    notes: 'Patient with worsening heart failure symptoms. Echocardiogram shows reduced ejection fraction (35%). Optimized medical therapy initiated. Advised low-sodium diet and fluid restriction. Weight monitoring daily.',
    followUpRequired: true,
    prescriptions: ['Furosemide 40mg daily', 'Enalapril 10mg twice daily', 'Carvedilol 12.5mg twice daily']
  },
  {
    diagnosis: 'Stable Angina',
    symptoms: ['Chest pain on exertion', 'Pressure in chest', 'Mild shortness of breath'],
    medications: ['Nitroglycerin 0.5mg (as needed)', 'Amlodipine 5mg', 'Metoprolol 50mg'],
    vitals: {
      bloodPressure: '135/88',
      heartRate: 75,
      temperature: 98.6,
      weight: 72,
      height: 165
    },
    allergies: [],
    chronicConditions: ['Coronary Artery Disease', 'Hypertension'],
    notes: 'Patient reports typical angina symptoms. Stress test shows reversible ischemia. Medical management optimized. Patient educated on when to use nitroglycerin. Lifestyle counseling provided.',
    followUpRequired: false,
    prescriptions: ['Nitroglycerin 0.5mg sublingual PRN', 'Amlodipine 5mg daily', 'Metoprolol 50mg twice daily']
  },
  {
    diagnosis: 'Cardiac Arrhythmia - Premature Ventricular Contractions',
    symptoms: ['Palpitations', 'Skipped beats', 'Mild dizziness'],
    medications: ['Metoprolol 25mg'],
    vitals: {
      bloodPressure: '120/75',
      heartRate: 78,
      temperature: 98.4,
      weight: 68,
      height: 160
    },
    allergies: [],
    chronicConditions: [],
    notes: 'Patient experiencing frequent PVCs. Holter monitor shows benign pattern. No structural heart disease. Reassured patient. Started on low-dose beta-blocker for symptom control.',
    followUpRequired: false,
    prescriptions: ['Metoprolol 25mg twice daily']
  },
  {
    diagnosis: 'Hyperlipidemia',
    symptoms: [],
    medications: ['Atorvastatin 20mg'],
    vitals: {
      bloodPressure: '128/82',
      heartRate: 72,
      temperature: 98.6,
      weight: 78,
      height: 173
    },
    allergies: [],
    chronicConditions: ['Hyperlipidemia', 'Family history of CAD'],
    notes: 'Routine lipid panel shows elevated LDL (160 mg/dL). Started on statin therapy. Advised Mediterranean diet and regular exercise. Recheck lipids in 6 weeks.',
    followUpRequired: true,
    prescriptions: ['Atorvastatin 20mg at bedtime']
  },
  {
    diagnosis: 'Post-PCI Follow-up',
    symptoms: [],
    medications: ['Aspirin 81mg', 'Clopidogrel 75mg', 'Atorvastatin 40mg'],
    vitals: {
      bloodPressure: '125/78',
      heartRate: 70,
      temperature: 98.4,
      weight: 76,
      height: 170
    },
    allergies: [],
    chronicConditions: ['Coronary Artery Disease', 'Status post PCI'],
    notes: 'Patient doing well post-PCI. No complications. Stent appears patent on follow-up angiography. Continue dual antiplatelet therapy for 12 months. Patient counseled on medication compliance.',
    followUpRequired: true,
    prescriptions: ['Aspirin 81mg daily', 'Clopidogrel 75mg daily (continue for 12 months)']
  }
];

// Vaccination data
const vaccinationOptions = [
  ['COVID-19 (Pfizer)', 'Influenza 2024', 'Tetanus/Diphtheria'],
  ['COVID-19 (Moderna)', 'Pneumococcal', 'Influenza 2024'],
  ['COVID-19 (Pfizer)', 'Shingles', 'Tetanus/Diphtheria'],
  ['Influenza 2024', 'Pneumococcal'],
  ['COVID-19 (Pfizer)', 'Influenza 2024', 'Pneumococcal', 'Tetanus/Diphtheria']
];

async function populatePatientMedicalRecords() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await connectDB();
    
    // Get collections
    const doctorsCollection = await getCollection('Doctor');
    const patientsCollection = await getCollection('Patient');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    
    // Find the doctor using mongoose model or collection
    console.log('\n👨‍⚕️ Searching for doctor: Nooran Ishtiaq Ahmed...');
    let doctor = await doctorsCollection.findOne({
      $or: [
        { _id: new mongoose.Types.ObjectId('68f68ef4ddaa73a2d37d944b') },
        { DoctorName: 'Nooran Ishtiaq Ahmed' },
        { email: 'i222010@nu.edu.pk' }
      ]
    });
    
    if (!doctor) {
      console.log('❌ Doctor "Nooran Ishtiaq Ahmed" not found.');
      console.log('\n📋 Searching for any doctor...');
      const anyDoctor = await doctorsCollection.findOne({});
      if (anyDoctor) {
        console.log(`✅ Found doctor: ${anyDoctor.DoctorName || anyDoctor.name || 'Unknown'} (ID: ${anyDoctor._id})`);
        console.log('⚠️ Using this doctor instead. Update the script if you want a specific doctor.');
        doctor = anyDoctor;
      } else {
        console.log('❌ No doctors found in database.');
        process.exit(1);
      }
    } else {
      console.log(`✅ Found doctor: ${doctor.DoctorName || doctor.name || 'Unknown'}`);
      console.log(`   Doctor ID: ${doctor._id}`);
    }
    
    const doctorId = doctor._id;
    
    // Get patients
    console.log('\n👥 Fetching patients...');
    const patients = await patientsCollection.find({ 
      isActive: { $in: ['true', true, null] } 
    }).limit(20).toArray();
    
    if (patients.length === 0) {
      console.log('❌ No patients found in database.');
      process.exit(1);
    }
    
    console.log(`✅ Found ${patients.length} patients`);
    
    // Get existing appointments for this doctor
    console.log('\n📅 Fetching existing appointments...');
    const existingAppointments = await appointmentsCollection.find({
      doctorId: doctorId
    }).toArray();
    
    console.log(`✅ Found ${existingAppointments.length} existing appointments`);
    
    // Create medical records
    console.log('\n📝 Creating patient medical records...');
    let createdCount = 0;
    let updatedCount = 0;
    
    for (let i = 0; i < Math.min(patients.length, medicalRecordTemplates.length); i++) {
      const patient = patients[i];
      const template = medicalRecordTemplates[i];
      
      // Find or create an appointment for this patient-doctor pair
      let appointment = existingAppointments.find(apt => 
        apt.patientId && apt.patientId.toString() === patient._id.toString()
      );
      
      // If no appointment exists, create one using mongoose model
      if (!appointment) {
        // Create appointment date (mix of past and future dates)
        const appointmentDate = new Date();
        if (i % 3 === 0) {
          // Past appointment (1-7 days ago)
          appointmentDate.setDate(appointmentDate.getDate() - (Math.floor(Math.random() * 7) + 1));
        } else if (i % 3 === 1) {
          // Today's appointment
          appointmentDate.setHours(10 + Math.floor(Math.random() * 8), 0, 0, 0);
        } else {
          // Future appointment (1-14 days ahead)
          appointmentDate.setDate(appointmentDate.getDate() + (Math.floor(Math.random() * 14) + 1));
        }
        
        const newAppointment = await DocAppointment.create({
          doctorId: doctorId,
          patientId: patient._id,
          appointmentDate: appointmentDate,
          type: ['In-Person', 'Video Call', 'Follow-up'][Math.floor(Math.random() * 3)],
          status: appointmentDate < new Date() ? 'completed' : 'upcoming',
          reason: template.diagnosis,
          notes: `Appointment for ${template.diagnosis}`,
          location: 'Cardiology Department, Main Hospital'
        });
        
        appointment = newAppointment;
        console.log(`   Created appointment for patient ${i + 1}`);
      }
      
      // Add random vaccinations
      const vaccinations = vaccinationOptions[Math.floor(Math.random() * vaccinationOptions.length)];
      
      // Set follow-up date if required
      let followUpDate = null;
      if (template.followUpRequired) {
        followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + (Math.floor(Math.random() * 30) + 7)); // 7-37 days from now
      }
      
      // Create or update medical record
      const medicalRecordData = {
        patientId: patient._id,
        doctorId: doctorId,
        appointmentId: appointment._id,
        diagnosis: template.diagnosis,
        symptoms: template.symptoms,
        medications: template.medications,
        vaccinations: vaccinations,
        vitals: template.vitals,
        allergies: template.allergies,
        chronicConditions: template.chronicConditions,
        notes: template.notes,
        followUpRequired: template.followUpRequired,
        followUpDate: followUpDate,
        prescriptions: template.prescriptions
      };
      
      const existingRecord = await PatientMedicalRecord.findOne({
        patientId: patient._id,
        appointmentId: appointment._id
      });
      
      if (existingRecord) {
        await PatientMedicalRecord.findByIdAndUpdate(existingRecord._id, medicalRecordData);
        updatedCount++;
        console.log(`   ✓ Updated medical record for patient: ${patient.firstName || 'Unknown'} ${patient.lastName || ''} (${template.diagnosis})`);
      } else {
        await PatientMedicalRecord.create(medicalRecordData);
        createdCount++;
        console.log(`   ✓ Created medical record for patient: ${patient.firstName || 'Unknown'} ${patient.lastName || ''} (${template.diagnosis})`);
      }
    }
    
    // Create additional records for remaining patients (simpler records)
    if (patients.length > medicalRecordTemplates.length) {
      console.log('\n📝 Creating additional medical records for remaining patients...');
      
      for (let i = medicalRecordTemplates.length; i < patients.length; i++) {
        const patient = patients[i];
        
        // Find or create appointment
        let appointment = existingAppointments.find(apt => 
          apt.patientId && apt.patientId.toString() === patient._id.toString()
        );
        
        if (!appointment) {
          const appointmentDate = new Date();
          appointmentDate.setDate(appointmentDate.getDate() + Math.floor(Math.random() * 30));
          
          appointment = await DocAppointment.create({
            doctorId: doctorId,
            patientId: patient._id,
            appointmentDate: appointmentDate,
            type: 'In-Person',
            status: 'upcoming',
            reason: 'Routine checkup',
            location: 'Cardiology Department'
          });
        }
        
        const simpleRecord = {
          patientId: patient._id,
          doctorId: doctorId,
          appointmentId: appointment._id,
          diagnosis: 'Routine Cardiovascular Assessment',
          symptoms: [],
          medications: [],
          vaccinations: ['Influenza 2024'],
          vitals: {
            bloodPressure: `${120 + Math.floor(Math.random() * 20)}/${70 + Math.floor(Math.random() * 15)}`,
            heartRate: 70 + Math.floor(Math.random() * 20),
            temperature: 98.6,
            weight: 70 + Math.floor(Math.random() * 20),
            height: 165 + Math.floor(Math.random() * 15)
          },
          allergies: [],
          chronicConditions: [],
          notes: 'Routine cardiovascular checkup. Patient appears healthy. No immediate concerns.',
          followUpRequired: false,
          followUpDate: null,
          prescriptions: []
        };
        
        const existingRecord = await PatientMedicalRecord.findOne({
          patientId: patient._id,
          appointmentId: appointment._id
        });
        
        if (!existingRecord) {
          await PatientMedicalRecord.create(simpleRecord);
          createdCount++;
          console.log(`   ✓ Created routine record for patient: ${patient.firstName || 'Unknown'} ${patient.lastName || ''}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Population Complete!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Doctor: ${doctor.DoctorName || doctor.name || 'Unknown'}`);
    console.log(`   - Patients processed: ${patients.length}`);
    console.log(`   - Medical records created: ${createdCount}`);
    console.log(`   - Medical records updated: ${updatedCount}`);
    console.log(`   - Total records: ${createdCount + updatedCount}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error populating medical records:', error);
    process.exit(1);
  }
}

// Run the population script
populatePatientMedicalRecords();

