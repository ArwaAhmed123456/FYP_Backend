const HealthTipModel = require('./models/HealthTipModel');

async function verifyUrduTips() {
  try {
    console.log('🔍 Verifying Urdu health tips in database...\n');
    
    const collection = await HealthTipModel.getCollection();
    const allTips = await collection.find({ isActive: true }).toArray();
    
    console.log(`📊 Total active tips: ${allTips.length}\n`);
    
    // Count tips with Urdu
    const tipsWithUrdu = allTips.filter(tip => tip.tipUrdu && tip.tipUrdu.trim().length > 0);
    const tipsWithoutUrdu = allTips.filter(tip => !tip.tipUrdu || tip.tipUrdu.trim().length === 0);
    
    console.log(`✅ Tips WITH Urdu translation: ${tipsWithUrdu.length}`);
    console.log(`❌ Tips WITHOUT Urdu translation: ${tipsWithoutUrdu.length}\n`);
    
    if (tipsWithUrdu.length > 0) {
      console.log('📝 Sample tips WITH Urdu:');
      tipsWithUrdu.slice(0, 3).forEach((tip, index) => {
        console.log(`\n   ${index + 1}. English: ${tip.tip.substring(0, 60)}...`);
        console.log(`      Urdu: ${tip.tipUrdu.substring(0, 60)}...`);
      });
    }
    
    if (tipsWithoutUrdu.length > 0) {
      console.log('\n⚠️  Sample tips WITHOUT Urdu:');
      tipsWithoutUrdu.slice(0, 3).forEach((tip, index) => {
        console.log(`\n   ${index + 1}. English: ${tip.tip.substring(0, 60)}...`);
        console.log(`      Urdu: ${tip.tipUrdu ? '(empty)' : '(missing)'}`);
      });
    }
    
    // Test the API with Urdu language
    console.log('\n🧪 Testing API with Urdu language...');
    const healthTipsService = require('./services/healthTipsService');
    const urduResponse = await healthTipsService.getHealthTipOfTheDay('ur');
    
    if (urduResponse.success) {
      const tip = urduResponse.data;
      console.log(`\n✅ API Response for Urdu:`);
      console.log(`   Language: ${tip.language}`);
      console.log(`   Tip text: ${tip.tip.substring(0, 80)}...`);
      console.log(`   Has tipUrdu in original: ${!!tip.tipUrdu}`);
      
      // Check if the returned tip is actually Urdu (contains Urdu characters)
      const hasUrduChars = /[\u0600-\u06FF]/.test(tip.tip);
      console.log(`   Contains Urdu characters: ${hasUrduChars}`);
      
      if (!hasUrduChars && tipsWithUrdu.length > 0) {
        console.log('\n⚠️  WARNING: API returned English text even though Urdu tips exist in database!');
        console.log('   This might indicate the selected tip for today doesn\'t have Urdu translation.');
      }
    }
    
    // Test with English
    console.log('\n🧪 Testing API with English language...');
    const englishResponse = await healthTipsService.getHealthTipOfTheDay('en');
    if (englishResponse.success) {
      const tip = englishResponse.data;
      console.log(`\n✅ API Response for English:`);
      console.log(`   Language: ${tip.language}`);
      console.log(`   Tip text: ${tip.tip.substring(0, 80)}...`);
    }
    
    console.log('\n📋 Summary:');
    console.log(`   - Total tips: ${allTips.length}`);
    console.log(`   - Tips with Urdu: ${tipsWithUrdu.length} (${Math.round(tipsWithUrdu.length / allTips.length * 100)}%)`);
    console.log(`   - Tips without Urdu: ${tipsWithoutUrdu.length} (${Math.round(tipsWithoutUrdu.length / allTips.length * 100)}%)`);
    
    if (tipsWithoutUrdu.length > 0) {
      console.log('\n💡 Recommendation:');
      console.log('   Run the add_urdu_tips.js script to add Urdu translations:');
      console.log('   node add_urdu_tips.js');
    } else {
      console.log('\n✅ All tips have Urdu translations!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error verifying Urdu tips:', error);
    process.exit(1);
  }
}

// Run the verification
verifyUrduTips();

