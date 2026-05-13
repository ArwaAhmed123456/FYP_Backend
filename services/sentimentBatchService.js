/**
 * Sentiment Batch Service
 *
 * Processes pending feedback records sequentially using the existing
 * Python-based sentiment analysis model. Updates DoctorFeedbackAnalysis
 * aggregates after each doctor's records are processed.
 *
 * Urdu detection: if feedback_text contains Urdu characters, it is first
 * translated to English using GPT-4o-mini before sentiment analysis.
 * The original Urdu text is preserved in feedback_text; the English
 * translation is stored in translated_text.
 *
 * Exported API:
 *   runSentimentBatch()  — returns { total, processed, failed, skipped, translated, durationMs }
 */
const PatientFeedback = require('../models/PatientFeedbackModel');
const { analyzeSentiment } = require('./sentimentAnalysisService');
const { updateDoctorFeedbackAnalysis } = require('../controller/feedbackController');
const axios = require('axios');

// Urdu Unicode block: U+0600–U+06FF (also covers Arabic script used in Urdu)
function containsUrdu(text) {
  return /[\u0600-\u06FF]/.test(text);
}

async function translateToEnglish(urduText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[sentimentBatch] OPENAI_API_KEY not set — skipping translation, using original text');
    return urduText;
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a translator. Translate the following Urdu patient review into English. Return only the English translation, nothing else.'
        },
        { role: 'user', content: urduText }
      ],
      max_tokens: 400,
      temperature: 0.2
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  return response.data.choices[0].message.content.trim();
}

/**
 * If text contains Urdu characters, translates to English via GPT-4o-mini.
 * Returns { textForAnalysis, translatedText } where translatedText is set only
 * when translation occurred.
 */
async function prepareText(originalText) {
  if (!containsUrdu(originalText)) {
    return { textForAnalysis: originalText, translatedText: null };
  }

  try {
    console.log('[sentimentBatch] Urdu detected — translating via GPT-4o-mini…');
    const translated = await translateToEnglish(originalText);
    console.log(`[sentimentBatch] Translated: "${translated.substring(0, 80)}…"`);
    return { textForAnalysis: translated, translatedText: translated };
  } catch (err) {
    console.warn(`[sentimentBatch] Translation failed (${err.message}) — using original text`);
    return { textForAnalysis: originalText, translatedText: null };
  }
}

/**
 * Run sentiment analysis on all feedback records with sentimentStatus: 'pending'.
 * Processes sequentially (Python subprocess cannot handle concurrent calls).
 *
 * @returns {{ total, processed, failed, skipped, translated, durationMs }}
 */
async function runSentimentBatch() {
  const start = Date.now();
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let translated = 0;

  console.log('[sentimentBatch] Starting batch run…');

  const pending = await PatientFeedback.find({ sentimentStatus: 'pending' })
    .select('_id feedback_text doctor_id')
    .sort({ created_at: 1 })
    .lean();

  const total = pending.length;
  console.log(`[sentimentBatch] ${total} pending record(s) found`);

  const affectedDoctors = new Set();

  for (const record of pending) {
    if (!record.feedback_text || record.feedback_text.trim().length === 0) {
      await PatientFeedback.findByIdAndUpdate(record._id, {
        sentiment_label: 'Neutral',
        sentiment_score: 0.5,
        sentimentStatus: 'processed'
      });
      skipped++;
      affectedDoctors.add(record.doctor_id.toString());
      continue;
    }

    try {
      const { textForAnalysis, translatedText } = await prepareText(record.feedback_text);
      const result = await analyzeSentiment(textForAnalysis);

      const update = {
        sentiment_label: result.label,
        sentiment_score: result.score,
        sentimentStatus: 'processed'
      };
      if (translatedText) {
        update.translated_text = translatedText;
        translated++;
      }

      await PatientFeedback.findByIdAndUpdate(record._id, update);
      processed++;
      affectedDoctors.add(record.doctor_id.toString());
    } catch (err) {
      console.error(`[sentimentBatch] Failed for record ${record._id}:`, err.message);
      await PatientFeedback.findByIdAndUpdate(record._id, { sentimentStatus: 'failed' });
      failed++;
    }
  }

  for (const doctorId of affectedDoctors) {
    try {
      await updateDoctorFeedbackAnalysis(doctorId);
    } catch (err) {
      console.error(`[sentimentBatch] Failed to update analysis for doctor ${doctorId}:`, err.message);
    }
  }

  const durationMs = Date.now() - start;
  console.log(
    `[sentimentBatch] Done in ${durationMs}ms — processed: ${processed}, translated: ${translated}, failed: ${failed}, skipped: ${skipped}, total: ${total}`
  );

  return { total, processed, failed, skipped, translated, durationMs };
}

module.exports = { runSentimentBatch };
