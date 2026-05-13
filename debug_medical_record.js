const PatientMedicalRecordModel = require('./models/PatientMedicalRecordModel');
const { connectToMongoDB } = require('./services/mongodb');

async function debugMedicalRecordCreation() {
  try {
    console.log('🔍 Debugging Medical Record Creation...');
    
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Test with a simple patient ID
    const testPatientId = '68f5202ec73e7923698d05ef';
    
    console.log(`\n📋 Testing with Patient ID: ${testPatientId}`);
    
    // Check if record already exists
    const existingRecord = await PatientMedicalRecordModel.getMedicalRecordByPatientId(testPatientId);
    
    if (existingRecord) {
      console.log('✅ Medical record already exists:');
      console.log(`   Record ID: ${existingRecord._id}`);
      console.log(`   Patient ID: ${existingRecord.patientId}`);
    } else {
      console.log('❌ No medical record found. Attempting to create one...');
      
      try {
        const result = await PatientMedicalRecordModel.createMedicalRecord(testPatientId);
        console.log('✅ Medical record creation result:', result);
        
        if (result.insertedId) {
          console.log(`   New Record ID: ${result.insertedId}`);
          
          // Verify it was created
          const newRecord = await PatientMedicalRecordModel.getMedicalRecordByPatientId(testPatientId);
          if (newRecord) {
            console.log('✅ Verification successful - record found after creation');
          } else {
            console.log('❌ Verification failed - record not found after creation');
          }
        }
      } catch (createError) {
        console.error('❌ Error creating medical record:', createError);
      }
    }
    
    // Test the collection directly
    console.log('\n🔍 Testing collection directly...');
    const collection = await PatientMedicalRecordModel.getCollection();
    const allRecords = await collection.find({}).toArray();
    console.log(`📊 Total records in collection: ${allRecords.length}`);
    
    allRecords.forEach((record, index) => {
      console.log(`${index + 1}. Record ID: ${record._id}, Patient ID: ${record.patientId}`);
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Run the debug
debugMedicalRecordCreation()
  .then(() => {
    console.log('\n✅ Debug completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
