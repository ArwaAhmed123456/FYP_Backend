const PatientMedicalRecordModel = require('./models/PatientMedicalRecordModel');
const { connectToMongoDB } = require('./services/mongodb');

async function checkMedicalRecords() {
  try {
    console.log('🔍 Checking Patient Medical Records collection...');
    
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Get medical records count
    const count = await PatientMedicalRecordModel.getMedicalRecordsCount();
    console.log(`\n📊 Total Medical Records: ${count}`);
    
    // Get recent medical records
    const recentRecords = await PatientMedicalRecordModel.getAllMedicalRecords(5, 0);
    
    console.log('\n📋 Recent Medical Records:');
    console.log('==========================');
    recentRecords.forEach((record, index) => {
      console.log(`\n${index + 1}. Record ID: ${record._id}`);
      console.log(`   Patient ID: ${record.patientId}`);
      console.log(`   Doctor ID: ${record.doctorId}`);
      console.log(`   Diagnosis: "${record.diagnosis}"`);
      console.log(`   Symptoms: ${JSON.stringify(record.symptoms)}`);
      console.log(`   Medications: ${JSON.stringify(record.medications)}`);
      console.log(`   Allergies: ${JSON.stringify(record.allergies)}`);
      console.log(`   Notes: "${record.notes}"`);
      console.log(`   Follow Up Required: ${record.followUpRequired}`);
      console.log(`   Created: ${record.createdAt}`);
    });
    
    // Check for our test patient's medical record
    const testPatientId = '68f5202ec73e7923698d05ef'; // From our latest test
    const testRecord = await PatientMedicalRecordModel.getMedicalRecordByPatientId(testPatientId);
    
    console.log('\n🎯 Medical Record for Test Patient (l227883@isb.nu.edu.pk):');
    console.log('=============================================================');
    if (testRecord) {
      console.log(`Found: Yes`);
      console.log(`Record ID: ${testRecord._id}`);
      console.log(`Patient ID: ${testRecord.patientId}`);
      console.log(`Diagnosis: "${testRecord.diagnosis}"`);
      console.log(`Symptoms: ${JSON.stringify(testRecord.symptoms)}`);
      console.log(`Medications: ${JSON.stringify(testRecord.medications)}`);
      console.log(`Allergies: ${JSON.stringify(testRecord.allergies)}`);
      console.log(`Notes: "${testRecord.notes}"`);
      console.log(`Created: ${testRecord.createdAt}`);
    } else {
      console.log('Found: No (medical record was not created for this patient)');
    }
    
  } catch (error) {
    console.error('❌ Error checking medical records:', error);
  }
}

// Run the check
checkMedicalRecords()
  .then(() => {
    console.log('\n✅ Medical records check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Failed to check medical records:', error);
    process.exit(1);
  });
