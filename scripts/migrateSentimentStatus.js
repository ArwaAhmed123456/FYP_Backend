/**
 * Migration: Backfill sentimentStatus on existing PatientFeedback documents
 *
 * Run ONCE after deploying the sentiment decoupling changes:
 *   node backend/scripts/migrateSentimentStatus.js
 *
 * Logic:
 *   - Documents that already have sentiment_label set → sentimentStatus: 'processed'
 *   - Documents without sentiment_label              → sentimentStatus: 'pending'
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI / MONGODB_URI not found in .env');
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected to MongoDB');

  const collection = mongoose.connection.collection('Patient_Feedback');

  // 1. Mark records that already have a sentiment label as processed
  const processedResult = await collection.updateMany(
    {
      sentiment_label: { $exists: true, $ne: null },
      sentimentStatus: { $exists: false }
    },
    { $set: { sentimentStatus: 'processed' } }
  );
  console.log(`✅  Marked ${processedResult.modifiedCount} records as 'processed'`);

  // 2. Mark records without a sentiment label as pending
  const pendingResult = await collection.updateMany(
    {
      $or: [
        { sentiment_label: { $exists: false } },
        { sentiment_label: null }
      ],
      sentimentStatus: { $exists: false }
    },
    { $set: { sentimentStatus: 'pending' } }
  );
  console.log(`✅  Marked ${pendingResult.modifiedCount} records as 'pending'`);

  // 3. Summary
  const totalProcessed = await collection.countDocuments({ sentimentStatus: 'processed' });
  const totalPending   = await collection.countDocuments({ sentimentStatus: 'pending' });
  const totalFailed    = await collection.countDocuments({ sentimentStatus: 'failed' });
  console.log(`\n📊  Migration summary:`);
  console.log(`    processed : ${totalProcessed}`);
  console.log(`    pending   : ${totalPending}`);
  console.log(`    failed    : ${totalFailed}`);

  await mongoose.disconnect();
  console.log('\n✅  Migration complete');
}

migrate().catch(err => {
  console.error('❌  Migration error:', err);
  process.exit(1);
});
