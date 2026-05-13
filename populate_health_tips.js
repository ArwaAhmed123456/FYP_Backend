const healthTipsService = require('./services/healthTipsService');
const HealthTipModel = require('./models/HealthTipModel');

async function populateHealthTips() {
  try {
    console.log('🚀 Starting health tips population...');
    
    // First, let's check if there are already tips in the database
    const existingCount = await HealthTipModel.getHealthTipsCount();
    console.log(`📊 Current tips in database: ${existingCount}`);
    
    if (existingCount > 0) {
      console.log('⚠️  Database already has tips. Do you want to continue? (This will add more tips)');
      // For now, let's continue to add more tips
    }
    
    // Generate and store health tips
    console.log('🔄 Generating health tips...');
    const result = await healthTipsService.generateAndStoreHealthTips();
    
    console.log('✅ Health tips generation completed!');
    console.log(`📈 Inserted ${result.insertedCount} new health tips`);
    
    // Verify the population
    const newCount = await HealthTipModel.getHealthTipsCount();
    console.log(`📊 Total tips in database now: ${newCount}`);
    
    // Test getting a tip of the day
    console.log('\n🎯 Testing health tip of the day...');
    const tipOfDay = await healthTipsService.getHealthTipOfTheDay();
    if (tipOfDay) {
      console.log('✅ Health tip of the day working!');
      console.log(`💡 Tip: ${tipOfDay.tip}`);
      console.log(`📂 Category: ${tipOfDay.category}`);
      console.log(`⭐ Priority: ${tipOfDay.priority}`);
    } else {
      console.log('❌ Failed to get health tip of the day');
    }
    
    // Test getting tips by category
    console.log('\n🔍 Testing tips by category...');
    const hydrationTips = await healthTipsService.getHealthTipsByCategory('hydration', 3);
    console.log(`💧 Found ${hydrationTips.length} hydration tips`);
    if (hydrationTips.length > 0) {
      console.log(`💡 Sample: ${hydrationTips[0].tip}`);
    }
    
  } catch (error) {
    console.error('❌ Error populating health tips:', error);
  }
}

// Run the population
populateHealthTips();
