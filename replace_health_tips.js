const { MongoClient } = require('mongodb');
const healthTipsService = require('./services/healthTipsService');
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function replaceHealthTips() {
  try {
    console.log('🔄 Starting health tips replacement...');
    
    const MONGO_URI = process.env.MONGO_URI;
    
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    console.log('✅ Connected to MongoDB Atlas');
    
    // Connect to Tabeeb database
    const db = client.db('Tabeeb');
    const collection = db.collection('Patient Dashboard Tips');
    
    // Check current count
    const currentCount = await collection.countDocuments();
    console.log(`📊 Current health tips in database: ${currentCount}`);
    
    // Clear existing tips
    console.log('🗑️  Clearing existing health tips...');
    const deleteResult = await collection.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} existing tips`);
    
    // Generate fresh tips from service
    console.log('🔄 Generating fresh health tips from service...');
    const freshTips = healthTipsService.generatePakistaniSpecificTips();
    console.log(`📝 Generated ${freshTips.length} fresh tips`);
    
    // Insert fresh tips
    console.log('💾 Inserting fresh health tips...');
    const tipsWithTimestamps = freshTips.map(tip => ({
      tip: tip.tip,
      category: tip.category || 'general',
      priority: tip.priority || 'medium',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const insertResult = await collection.insertMany(tipsWithTimestamps);
    console.log(`✅ Successfully inserted ${insertResult.insertedCount} fresh health tips`);
    
    // Verify the replacement
    const newCount = await collection.countDocuments();
    console.log(`📊 New total health tips in database: ${newCount}`);
    
    // Test health tip of the day
    console.log('\n🎯 Testing health tip of the day...');
    const tipOfDay = await collection.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: 1 } }
    ]).toArray();
    
    if (tipOfDay.length > 0) {
      console.log('✅ Health tip of the day working!');
      console.log(`💡 Tip: ${tipOfDay[0].tip}`);
      console.log(`📂 Category: ${tipOfDay[0].category}`);
      console.log(`⭐ Priority: ${tipOfDay[0].priority}`);
    }
    
    // Test tips by category
    console.log('\n🔍 Testing tips by category...');
    const hydrationTips = await collection.find({ 
      category: 'hydration_heat', 
      isActive: true 
    }).limit(3).toArray();
    
    console.log(`💧 Found ${hydrationTips.length} hydration_heat tips`);
    if (hydrationTips.length > 0) {
      console.log(`💡 Sample: ${hydrationTips[0].tip}`);
    }
    
    // Show category distribution
    console.log('\n📊 Category distribution:');
    const categories = await collection.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    categories.forEach(cat => {
      console.log(`   ${cat._id}: ${cat.count} tips`);
    });
    
    await client.close();
    console.log('\n🎉 Health tips replacement completed successfully!');
    
  } catch (error) {
    console.error('❌ Error replacing health tips:', error);
  }
}

replaceHealthTips();
