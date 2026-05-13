require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

// MongoDB connection string - Atlas connection
const MONGO_URI = process.env.MONGO_URI;
const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';

async function debugLogin() {
  let client = null;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const database = client.db(DATABASE_NAME);
    const usersCollection = database.collection('Patient');
    
    const testEmail = 'testuser@example.com';
    const testPassword = 'test123';
    
    console.log(`\n🧪 Testing login for: ${testEmail}`);
    console.log(`   Password: ${testPassword}\n`);
    
    // Step 1: Find user by email
    console.log('1️⃣ Finding user by email...');
    const user = await usersCollection.findOne({ emailAddress: testEmail });
    
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('✅ User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.emailAddress}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Password Hash: ${user.password ? user.password.substring(0, 20) + '...' : 'No password'}`);
    
    // Step 2: Check if user is active
    console.log('\n2️⃣ Checking if user is active...');
    if (user.isActive !== 'true') {
      console.log('❌ User is not active!');
      return;
    }
    console.log('✅ User is active');
    
    // Step 3: Verify password
    console.log('\n3️⃣ Verifying password...');
    const isPasswordValid = await bcrypt.compare(testPassword, user.password);
    console.log(`   Password valid: ${isPasswordValid ? '✅ YES' : '❌ NO'}`);
    
    if (isPasswordValid) {
      console.log('\n🎉 LOGIN SHOULD SUCCEED!');
      console.log('   The issue might be in the API endpoint or server configuration.');
    } else {
      console.log('\n❌ LOGIN WILL FAIL - Password mismatch');
    }
    
    // Step 4: Test with different password formats
    console.log('\n4️⃣ Testing with different password variations...');
    const passwordVariations = [
      'test123',
      'Test123',
      'TEST123',
      ' test123',
      'test123 ',
      'test123\n',
      'test123\r'
    ];
    
    for (const variation of passwordVariations) {
      const isValid = await bcrypt.compare(variation, user.password);
      console.log(`   "${variation}" -> ${isValid ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

// Run the script
debugLogin();
