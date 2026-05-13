const { MongoClient } = require('mongodb');
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function checkDatabases() {
  try {
    console.log('🔍 Checking available databases...');
    
    const MONGO_URI = process.env.MONGO_URI;
    
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    console.log('✅ Connected to MongoDB Atlas');
    
    // List all databases
    const dbs = await client.db().admin().listDatabases();
    
    console.log('\n📊 Available databases:');
    dbs.databases.forEach(db => {
      console.log(`   - ${db.name} (${db.sizeOnDisk} bytes)`);
    });
    
    // Check if both Tabeeb and tabeeb exist
    const hasTabeeb = dbs.databases.some(db => db.name === 'Tabeeb');
    const hastabeeb = dbs.databases.some(db => db.name === 'Tabeeb');
    
    console.log(`\n🔍 Database check:`);
    console.log(`   - Tabeeb (uppercase): ${hasTabeeb ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`   - Tabeeb (uppercase): ${hastabeeb ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    
    if (hasTabeeb) {
      console.log('\n✅ Use Tabeeb (uppercase) database');
    } else {
      console.log('\n❌ Tabeeb database does not exist');
    }
    
    // Test connection to Tabeeb
    if (hasTabeeb) {
      console.log('\n🧪 Testing connection to Tabeeb database...');
      try {
        const tabeebDb = client.db('Tabeeb');
        const collections = await tabeebDb.listCollections().toArray();
        console.log(`   Collections in Tabeeb: ${collections.length}`);
        collections.forEach(col => console.log(`     - ${col.name}`));
      } catch (error) {
        console.log(`   ❌ Error accessing Tabeeb: ${error.message}`);
      }
    }
    
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error checking databases:', error);
  }
}

checkDatabases();
