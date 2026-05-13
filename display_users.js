require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

// MongoDB connection string - Atlas connection
const MONGO_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.DATABASE_NAME || 'Tabeeb';

async function displayAllUsers() {
  let client = null;
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    
    // List all databases first
    console.log('📋 Available databases:');
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    dbs.databases.forEach(db => console.log(`   - ${db.name}`));
    
    // Try different database names
    const possibleDbNames = ['Tabeeb', 'patient', 'Patient', 'patients', 'Patients'];
    let database = null;
    let dbName = null;
    
    for (const name of possibleDbNames) {
      try {
        const testDb = client.db(name);
        const collections = await testDb.listCollections().toArray();
        if (collections.length > 0) {
          database = testDb;
          dbName = name;
          console.log(`✅ Found database: ${name} with ${collections.length} collections`);
          break;
        }
      } catch (error) {
        // Continue to next database name
      }
    }
    
    if (!database) {
      console.log('❌ No database found with collections.');
      return;
    }
    
    // Check available collections
    console.log(`📋 Available collections in ${dbName}:`);
    const collections = await database.listCollections().toArray();
    collections.forEach(col => console.log(`   - ${col.name}`));
    
    // Try different possible collection names
    const possibleCollectionNames = ['Patient', 'patient', 'users', 'Users', 'patients', 'Patients'];
    let usersCollection = null;
    let collectionName = null;
    
    for (const name of possibleCollectionNames) {
      const exists = await database.listCollections({ name }).hasNext();
      if (exists) {
        usersCollection = database.collection(name);
        collectionName = name;
        console.log(`✅ Found collection: ${name}`);
        break;
      }
    }
    
    if (!usersCollection) {
      console.log('❌ No users collection found with common names.');
      return;
    }
    
    console.log('📊 Fetching all users...');
    const users = await usersCollection.find({}).toArray();
    
    if (users.length === 0) {
      console.log('❌ No users found in the database.');
      console.log('\n🔧 Would you like to create a test user? (This is for demonstration purposes)');
      console.log('   Run: node create_test_user.js');
      return;
    }
    
    console.log(`\n✅ Found ${users.length} user(s):\n`);
    console.log('='.repeat(100));
    console.log('EMAIL ADDRESS'.padEnd(30) + ' | ' + 'PHONE'.padEnd(15) + ' | ' + 'NAME'.padEnd(20) + ' | ' + 'HASHED PASSWORD');
    console.log('='.repeat(100));
    
    users.forEach((user, index) => {
      const email = user.emailAddress || 'No email';
      const phone = user.phone || 'No phone';
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'No name';
      const password = user.password || 'No password';
      
      // Truncate long passwords for display
      const displayPassword = password.length > 30 ? password.substring(0, 27) + '...' : password;
      
      console.log(`${email.padEnd(30)} | ${phone.padEnd(15)} | ${name.padEnd(20)} | ${displayPassword}`);
      
      // Show additional user info
      console.log(`  Created: ${user.createdAt || 'N/A'}`);
      console.log(`  Active: ${user.isActive || 'N/A'}`);
      console.log(`  Role: ${user.userRole || 'N/A'}`);
      console.log('-'.repeat(100));
    });
    
    console.log(`\n📋 Summary:`);
    console.log(`   Total Users: ${users.length}`);
    console.log(`   Users with Email: ${users.filter(u => u.emailAddress).length}`);
    console.log(`   Users with Phone: ${users.filter(u => u.phone).length}`);
    console.log(`   Active Users: ${users.filter(u => u.isActive === 'true' || u.isActive === true).length}`);
    
    // Show password analysis
    console.log(`\n🔐 Password Analysis:`);
    const passwordLengths = users.map(u => u.password ? u.password.length : 0);
    console.log(`   Average password length: ${Math.round(passwordLengths.reduce((a, b) => a + b, 0) / passwordLengths.length)} characters`);
    console.log(`   Shortest password: ${Math.min(...passwordLengths)} characters`);
    console.log(`   Longest password: ${Math.max(...passwordLengths)} characters`);
    
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
displayAllUsers();