const HealthTipModel = require('./models/HealthTipModel');

async function insertSampleHealthTips() {
  try {
    console.log('🚀 Inserting sample health tips...');
    
    // Sample health tips
    const sampleTips = [
      {
        tip: "Drink at least 8 glasses of water daily to stay hydrated and maintain your energy levels.",
        category: "hydration",
        priority: "high"
      },
      {
        tip: "Eat fresh fruits and vegetables daily for better nutrition and immune system support.",
        category: "nutrition", 
        priority: "high"
      },
      {
        tip: "Wash your hands regularly with soap and water to prevent the spread of germs.",
        category: "hygiene",
        priority: "high"
      },
      {
        tip: "Get at least 7-8 hours of sleep each night for better health and focus.",
        category: "general",
        priority: "medium"
      },
      {
        tip: "Exercise for at least 30 minutes daily to maintain physical and mental health.",
        category: "general",
        priority: "medium"
      },
      {
        tip: "Avoid smoking and limit alcohol consumption for better long-term health.",
        category: "general",
        priority: "high"
      },
      {
        tip: "Keep your living space clean and well-ventilated to prevent respiratory issues.",
        category: "hygiene",
        priority: "medium"
      },
      {
        tip: "Eat smaller, more frequent meals instead of large portions for better digestion.",
        category: "nutrition",
        priority: "medium"
      },
      {
        tip: "Protect yourself from the sun by wearing sunscreen and appropriate clothing.",
        category: "sun_protection",
        priority: "high"
      },
      {
        tip: "Take regular breaks from screens to protect your eyes and reduce strain.",
        category: "general",
        priority: "low"
      }
    ];
    
    // Insert tips one by one to avoid bulk write issues
    let insertedCount = 0;
    for (const tip of sampleTips) {
      try {
        await HealthTipModel.createHealthTip(tip);
        insertedCount++;
        console.log(`✅ Inserted tip ${insertedCount}: ${tip.tip.substring(0, 50)}...`);
      } catch (error) {
        console.error(`❌ Failed to insert tip: ${tip.tip.substring(0, 50)}...`, error.message);
      }
    }
    
    console.log(`\n📊 Successfully inserted ${insertedCount} out of ${sampleTips.length} health tips`);
    
    // Test getting health tip of the day
    console.log('\n🎯 Testing health tip of the day...');
    const tipOfDay = await HealthTipModel.getHealthTipOfTheDay();
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
    const hydrationTips = await HealthTipModel.getHealthTipsByCategory('hydration', 3);
    console.log(`💧 Found ${hydrationTips.length} hydration tips`);
    if (hydrationTips.length > 0) {
      console.log(`💡 Sample: ${hydrationTips[0].tip}`);
    }
    
    // Check total count
    const totalCount = await HealthTipModel.getHealthTipsCount();
    console.log(`\n📊 Total health tips in database: ${totalCount}`);
    
  } catch (error) {
    console.error('❌ Error inserting sample health tips:', error);
  }
}

// Run the insertion
insertSampleHealthTips();
