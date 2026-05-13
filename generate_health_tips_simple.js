const healthTipsService = require('./services/healthTipsService');
const HealthTipModel = require('./models/HealthTipModel');

async function generateAndStoreHealthTips() {
  try {
    console.log('🚀 Starting health tips generation process...');
    
    // Clear existing tips first
    console.log('🧹 Clearing existing health tips...');
    const collection = await HealthTipModel.getCollection();
    await collection.deleteMany({});
    console.log('✅ Existing tips cleared');
    
    // Generate comprehensive health tips using the updated service
    console.log('📝 Generating health tips...');
    const allTips = await healthTipsService.generateComprehensiveHealthTips();
    console.log(`Generated ${allTips.length} comprehensive health tips`);
    
    // Store tips in database
    if (allTips.length > 0) {
      console.log('💾 Storing tips in database...');
      const result = await HealthTipModel.createMultipleHealthTips(allTips);
      console.log(`✅ Successfully stored ${result.insertedCount} health tips in database`);
      
      // Verify the tips were stored
      const totalTips = await HealthTipModel.getHealthTipsCount();
      console.log(`📈 Total health tips in database: ${totalTips}`);
      
      // Get a sample tip to verify
      const sampleTip = await healthTipsService.getHealthTipOfTheDay();
      if (sampleTip) {
        console.log('🎯 Sample health tip:');
        console.log(`   Category: ${sampleTip.category}`);
        console.log(`   Priority: ${sampleTip.priority}`);
        console.log(`   Tip: ${sampleTip.tip}`);
      }
      
      console.log('🎉 Health tips are ready for the dashboard!');
    } else {
      console.log('❌ No tips to store');
    }
    
  } catch (error) {
    console.error('❌ Error generating health tips:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  generateAndStoreHealthTips();
}

module.exports = generateAndStoreHealthTips;
