/**
 * Translation Service
 *
 * Single place for all translation logic.
 * Modelled on diagnosisSimplifierService.js (same OpenAI pattern).
 *
 * Exported API:
 *   translateFields(fields, targetLanguage)          — one GPT call for all fields
 *   getOrCreateTranslation(col, id, fields, lang)    — cache-first translate
 *   invalidateTranslation(col, id)                   — clear stale cache on update
 */
const axios = require('axios');
const TranslationModel = require('../models/TranslationModel');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a value is not worth translating:
 *   - null / undefined / empty string
 *   - a single word (proper nouns, medical Latin abbreviations)
 */
function isSkippable(value) {
  if (value === null || value === undefined) return true;
  const str = String(value).trim();
  if (str.length === 0) return true;
  // Single word (no spaces) — likely a proper noun or med-term abbreviation
  if (!/\s/.test(str)) return true;
  return false;
}

/**
 * Filter an object down to only fields worth translating.
 * Returns { filteredFields, skippedFields } where skippedFields keeps original values.
 */
function filterTranslatableFields(fields) {
  const filteredFields = {};
  const skippedFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (isSkippable(value)) {
      skippedFields[key] = value;
    } else {
      filteredFields[key] = value;
    }
  }

  return { filteredFields, skippedFields };
}

// ---------------------------------------------------------------------------
// 2a. translateFields
// ---------------------------------------------------------------------------

/**
 * Translate an object of { fieldName: text } pairs in a single GPT call.
 *
 * @param {Object} fields          — { fieldName: originalText }
 * @param {string} targetLanguage  — 'en' | 'ur'
 * @returns {Object}               — { fieldName: translatedText } (same keys)
 *
 * Rules:
 *  - If targetLanguage is 'en', return fields as-is (no API call).
 *  - Skip empty / null / single-word values.
 *  - Single GPT call for all remaining fields.
 *  - On invalid JSON: retry once.
 *  - On any error: return original fields (never throw).
 */
async function translateFields(fields, targetLanguage) {
  // English: no-op
  if (targetLanguage !== 'ur') return fields;

  if (!OPENAI_API_KEY) {
    console.error('[translationService] OPENAI_API_KEY not set');
    return fields;
  }

  const { filteredFields, skippedFields } = filterTranslatableFields(fields);

  // Nothing to translate after filtering
  if (Object.keys(filteredFields).length === 0) {
    return fields;
  }

  const systemPrompt =
    'You are a medical translator. Translate the following JSON fields into Urdu. ' +
    'Preserve all medical facts exactly. ' +
    'Return ONLY a valid JSON object with the same keys and translated values. ' +
    'Do not add any explanation or markdown.';

  const userContent = JSON.stringify(filteredFields);

  async function callGPT() {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    return response.data?.choices?.[0]?.message?.content?.trim() || '';
  }

  async function parseOrRetry() {
    let content = await callGPT();

    // First parse attempt
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (_) {}

    // Try to extract JSON object from content
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      } catch (_) {}
    }

    // Retry once
    try {
      content = await callGPT();
      const retryMatch = content.match(/\{[\s\S]*\}/);
      const src = retryMatch ? retryMatch[0] : content;
      const parsed = JSON.parse(src);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (_) {}

    return null; // Both attempts failed
  }

  try {
    const translated = await parseOrRetry();
    if (!translated) {
      console.error('[translationService] translateFields: GPT returned unparseable JSON after retry');
      return fields; // Fallback to original
    }

    // Merge: translated fields + skipped fields (original values)
    const result = { ...skippedFields };
    for (const key of Object.keys(filteredFields)) {
      result[key] =
        typeof translated[key] === 'string' ? translated[key] : fields[key];
    }
    return result;
  } catch (err) {
    console.error('[translationService] translateFields error:', err.message);
    return fields; // Always fall back
  }
}

// ---------------------------------------------------------------------------
// 2b. getOrCreateTranslation
// ---------------------------------------------------------------------------

/**
 * Cache-first translate. Returns translated fields object.
 *
 * @param {string}   sourceCollection — e.g. 'Blog', 'Doctor_appointment'
 * @param {*}        sourceId         — ObjectId of the source document
 * @param {Object}   fields           — { fieldName: originalText }
 * @param {string}   targetLanguage   — 'en' | 'ur'
 * @returns {Object}                  — { fieldName: translatedText }
 */
async function getOrCreateTranslation(sourceCollection, sourceId, fields, targetLanguage) {
  // English: always return original
  if (targetLanguage !== 'ur') return fields;

  try {
    // 1. Check cache
    const existing = await TranslationModel.findOne({
      sourceCollection,
      sourceId,
      targetLanguage,
    }).lean();

    if (existing) {
      // Convert Map storage back to plain object
      const cached = existing.fields instanceof Map
        ? Object.fromEntries(existing.fields)
        : (typeof existing.fields?.toObject === 'function'
            ? Object.fromEntries(existing.fields.toObject())
            : existing.fields);

      // Check for fields requested but not yet in cache (newly added translatable fields)
      const missingFields = {};
      for (const key of Object.keys(fields)) {
        if (cached[key] === undefined && fields[key]) {
          missingFields[key] = fields[key];
        }
      }

      if (Object.keys(missingFields).length > 0) {
        // Translate the missing fields and merge into cache
        const translatedMissing = await translateFields(missingFields, targetLanguage);
        const updatedCached = { ...cached, ...translatedMissing };
        await TranslationModel.findOneAndUpdate(
          { sourceCollection, sourceId, targetLanguage },
          { $set: { fields: updatedCached, updatedAt: new Date() } },
          { upsert: true }
        );
        return { ...fields, ...updatedCached };
      }

      // Merge: cached translated fields override originals
      return { ...fields, ...cached };
    }

    // 2. Translate
    const translated = await translateFields(fields, targetLanguage);

    // 3. Persist (upsert — safe against concurrent requests)
    await TranslationModel.findOneAndUpdate(
      { sourceCollection, sourceId, targetLanguage },
      {
        $set: {
          fields: translated,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          sourceCollection,
          sourceId,
          targetLanguage,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return translated;
  } catch (err) {
    console.error('[translationService] getOrCreateTranslation error:', err.message);
    return fields; // Always fall back to original
  }
}

// ---------------------------------------------------------------------------
// 2c. invalidateTranslation
// ---------------------------------------------------------------------------

/**
 * Delete all cached translations for a source document.
 * Call after any update to that document so stale translations are evicted.
 *
 * @param {string} sourceCollection
 * @param {*}      sourceId
 */
async function invalidateTranslation(sourceCollection, sourceId) {
  try {
    await TranslationModel.deleteMany({ sourceCollection, sourceId });
  } catch (err) {
    console.error('[translationService] invalidateTranslation error:', err.message);
    // Non-fatal — stale cache is acceptable until next eviction
  }
}

module.exports = {
  translateFields,
  getOrCreateTranslation,
  invalidateTranslation,
};
