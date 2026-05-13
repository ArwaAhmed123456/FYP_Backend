const healthTipsService = require('./services/healthTipsService');
const HealthTipModel = require('./models/HealthTipModel');

async function generateAndStoreHealthTips() {
  try {
    console.log('🚀 Starting health tips generation process...');
    console.log('📡 Fetching data from MyHealthfinder API...');
    
    // Generate comprehensive health tips
    const result = await healthTipsService.generateAndStoreHealthTips();
    
    console.log('✅ Health tips generation completed successfully!');
    console.log(`📊 Generated and stored ${result.insertedCount} health tips`);
    
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