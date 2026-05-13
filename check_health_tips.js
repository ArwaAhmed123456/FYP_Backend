const { MongoClient } = require('mongodb');
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function checkHealthTips() {
  try {
    console.log('🔍 Checking health tips in Patient Dashboard Tips collection...');
    
    const MONGO_URI = process.env.MONGO_URI;
    
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    console.log('✅ Connected to MongoDB Atlas');
    
    // Connect to Tabeeb database
    const db = client.db('Tabeeb');
    const collection = db.collection('Patient Dashboard Tips');
    
    // Count total health tips
    const totalCount = await collection.countDocuments();
    console.log(`📊 Total health tips in database: ${totalCount}`);
    
    // Count active health tips
    const activeCount = await collection.countDocuments({ isActive: true });
    console.log(`✅ Active health tips: ${activeCount}`);
    
    // Get a sample health tip
    const sampleTip = await collection.findOne({ isActive: true });
    if (sampleTip) {
      console.log('\n💡 Sample health tip:');
      console.log(`   Tip: ${sampleTip.tip}`);
      console.log(`   Category: ${sampleTip.category}`);
      console.log(`   Priority: ${sampleTip.priority}`);
      console.log(`   Created: ${sampleTip.createdAt}`);
    } else {
      console.log('\n❌ No active health tips found');
    }
    
    // Get health tip of the day (random sample)
    const tipOfDay = await collection.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: 1 } }
    ]).toArray();
    
    if (tipOfDay.length > 0) {
      console.log('\n🎯 Health tip of the day test:');
      console.log(`   Tip: ${tipOfDay[0].tip}`);
      console.log(`   Category: ${tipOfDay[0].category}`);
      console.log(`   Priority: ${tipOfDay[0].priority}`);
    }
    
    // Get tips by category
    const hydrationTips = await collection.find({ 
      category: 'hydration', 
      isActive: true 
    }).limit(3).toArray();
    
    console.log(`\n💧 Hydration tips (${hydrationTips.length} found):`);
    hydrationTips.forEach((tip, index) => {
      console.log(`   ${index + 1}. ${tip.tip}`);
    });
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error checking health tips:', error);
  }
}

checkHealthTips();
