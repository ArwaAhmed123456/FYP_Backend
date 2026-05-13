/**
 * Sentiment Analysis Cron Job
 *
 * Schedules automatic batch sentiment processing every Sunday at 02:00 AM.
 * Uses node-cron (^4.2.1 already installed).
 */
const cron = require('node-cron');
const { runSentimentBatch } = require('../services/sentimentBatchService');

// Every Sunday at 02:00 AM
cron.schedule('0 2 * * 0', async () => {
  console.log('[sentimentCron] Weekly batch triggered at', new Date().toISOString());
  try {
    const summary = await runSentimentBatch();
    console.log('[sentimentCron] Batch complete:', summary);
  } catch (err) {
    console.error('[sentimentCron] Batch error:', err.message);
  }
});

console.log('[sentimentCron] Scheduled — runs every Sunday at 02:00 AM');
