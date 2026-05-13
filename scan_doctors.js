const { MongoClient } = require('mongodb');
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function scanDoctors() {
  const MONGO_URI = process.env.MONGO_URI;
  const DATABASE_NAME = 'Tabeeb';
  
  try {
    console.log('🔍 Connecting to MongoDB...');
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db(DATABASE_NAME);
    console.log('✅ Connected to database:', DATABASE_NAME);
    
    // Check different collections for doctor data
    const collections = await db.listCollections().toArray();
    console.log('📋 Available collections:', collections.map(c => c.name));
    
    // Look for users collection
    const usersCollection = db.collection('users');
    const userCount = await usersCollection.countDocuments();
    console.log('👥 Total users:', userCount);
    
    // Find doctors
    const doctors = await usersCollection.find({ role: 'Doctor' }).toArray();
    console.log('👨‍⚕️ Found doctors:', doctors.length);
    
    doctors.forEach((doctor, index) => {
      console.log(`\nDoctor ${index + 1}:`);
      console.log('Name:', doctor.name || (doctor.firstName + ' ' + doctor.lastName));
      console.log('Email:', doctor.email);
      console.log('Password:', doctor.password);
      console.log('Role:', doctor.role);
      console.log('Phone:', doctor.phone);
      console.log('Department:', doctor.department);
      console.log('Status:', doctor.status);
      console.log('Created:', doctor.createdAt);
    });
    
    // Also check User collection (capital U)
    const UserCollection = db.collection('User');
    const userCount2 = await UserCollection.countDocuments();
    console.log('\n👥 Total users in User collection:', userCount2);
    
    const doctors2 = await UserCollection.find({ role: 'Doctor' }).toArray();
    console.log('👨‍⚕️ Found doctors in User collection:', doctors2.length);
    
    doctors2.forEach((doctor, index) => {
      console.log(`\nDoctor ${index + 1} (User collection):`);
      console.log('Name:', doctor.name);
      console.log('Email:', doctor.email);
      console.log('Password:', doctor.password);
      console.log('Role:', doctor.role);
      console.log('Phone:', doctor.phone);
      console.log('Department:', doctor.department);
    });
    
    // Check for any other collections that might contain doctor data
    for (const collection of collections) {
      if (collection.name.toLowerCase().includes('doctor') || 
          collection.name.toLowerCase().includes('user') ||
          collection.name.toLowerCase().includes('admin')) {
        console.log(`\n🔍 Checking collection: ${collection.name}`);
        const coll = db.collection(collection.name);
        const count = await coll.countDocuments();
        console.log(`Total documents: ${count}`);
        
        // Try to find documents with role field
        const roleDocs = await coll.find({ role: { $exists: true } }).limit(5).toArray();
        if (roleDocs.length > 0) {
          console.log('Sample documents with role field:');
          roleDocs.forEach((doc, i) => {
            console.log(`  ${i + 1}. Role: ${doc.role}, Name: ${doc.name || doc.firstName || 'N/A'}, Email: ${doc.email || 'N/A'}`);
          });
        }
      }
    }
    
    await client.close();
    console.log('\n✅ Scan completed successfully!');
    
  } catch (error) {
    console.error('❌ Error scanning database:', error.message);
  }
}

scanDoctors();
