const OTPModel = require('./models/OTPModel');
const { connectToMongoDB } = require('./services/mongodb');

async function checkOTPCollection() {
  try {
    console.log('🔍 Checking OTPVerifications collection on MongoDB Atlas...');
    
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Get OTP statistics
    const stats = await OTPModel.getOTPStats();
    console.log('\n📊 OTP Collection Statistics:');
    console.log('================================');
    console.log(`Total OTP Records: ${stats.total}`);
    console.log(`Verified OTPs: ${stats.verified}`);
    console.log(`Expired OTPs: ${stats.expired}`);
    console.log(`Active OTPs: ${stats.active}`);
    
    // Get recent OTP records
    const collection = await OTPModel.getCollection();
    const recentOTPs = await collection.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    console.log('\n📋 Recent OTP Records:');
    console.log('======================');
    recentOTPs.forEach((otp, index) => {
      console.log(`\n${index + 1}. Contact: ${otp.contact}`);
      console.log(`   Method: ${otp.method}`);
      console.log(`   User Type: ${otp.userType}`);
      console.log(`   OTP Code: ${otp.otpCode}`);
      console.log(`   Verified: ${otp.isVerified}`);
      console.log(`   Expires: ${otp.expiresAt}`);
      console.log(`   Created: ${otp.createdAt}`);
      console.log(`   Attempts: ${otp.attempts}/${otp.maxAttempts}`);
    });
    
    // Check for our specific test OTP
    const testOTP = await collection.findOne({ 
      contact: 'l227883@isb.nu.edu.pk',
      method: 'email'
    });
    
    console.log('\n🎯 Test OTP Record for l227883@isb.nu.edu.pk:');
    console.log('==============================================');
    if (testOTP) {
      console.log(`Found: Yes`);
      console.log(`Contact: ${testOTP.contact}`);
      console.log(`Method: ${testOTP.method}`);
      console.log(`User Type: ${testOTP.userType}`);
      console.log(`OTP Code: ${testOTP.otpCode}`);
      console.log(`Verified: ${testOTP.isVerified}`);
      console.log(`Expires: ${testOTP.expiresAt}`);
      console.log(`Created: ${testOTP.createdAt}`);
      console.log(`Attempts: ${testOTP.attempts}/${testOTP.maxAttempts}`);
    } else {
      console.log('Found: No (may have been cleaned up after verification)');
    }
    
    // Get collection info
    const collectionInfo = await collection.stats();
    console.log('\n📈 Collection Information:');
    console.log('==========================');
    console.log(`Collection Name: ${collection.collectionName}`);
    console.log(`Document Count: ${collectionInfo.count}`);
    console.log(`Average Document Size: ${collectionInfo.avgObjSize} bytes`);
    console.log(`Total Size: ${collectionInfo.size} bytes`);
    
  } catch (error) {
    console.error('❌ Error checking OTP collection:', error);
  }
}

// Run the check
checkOTPCollection()
  .then(() => {
    console.log('\n✅ OTP collection check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Failed to check OTP collection:', error);
    process.exit(1);
  });
