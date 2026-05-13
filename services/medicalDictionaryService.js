/**
 * Medical dictionary service: extract terms from bot response (OpenAI), generate explanations, store in DB.
 * Duplicate terms per session are prevented. Session-scoped; entries cleared when session is deleted.
 */
const axios = require('axios');
const MedicalDictionaryEntryModel = require('../models/MedicalDictionaryEntryModel');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Extract medical terms and medicine names from text using OpenAI. Returns array of strings.
 */
async function extractMedicalTerms(text) {
  if (!OPENAI_API_KEY || !text || text.length < 10) {
    return [];
  }

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You extract medical terms, condition names, and medicine names from the given text. Return a JSON array of strings only, no other text. Example: ["fever", "paracetamol", "hypertension"]. If none found, return [].',
          },
          {
            role: 'user',
            content: text.substring(0, 6000),
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content =
      response.data?.choices?.[0]?.message?.content?.trim() || '[]';
    let terms = [];
    try {
      const parsed = JSON.parse(content);
      terms = Array.isArray(parsed)
        ? parsed.filter((t) => typeof t === 'string' && t.trim().length > 0)
        : [];
    } catch (e) {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          terms = JSON.parse(match[0]);
          if (!Array.isArray(terms)) terms = [];
        } catch (e2) {
          terms = [];
        }
      }
    }
    return terms.slice(0, 20);
  } catch (err) {
    console.error('[medicalDictionaryService] extractMedicalTerms error:', err.message);
    return [];
  }
}

// Phrases that indicate GPT could not recognize the term as a medical term.
const UNRECOGNIZED_PATTERNS = [
  /not a recognized medical term/i,
  /not a medical term/i,
  /no such term/i,
  /not a valid medical/i,
  /is not a recognized/i,
  /cannot find.*term/i,
  /unknown term/i,
  /doesn't appear to be a medical/i,
  /does not appear to be a medical/i,
  /not recogni[sz]ed.*term/i,
];

/**
 * Returns true when the GPT explanation signals the term is not a real medical term.
 */
function isUnrecognizedTerm(explanation) {
  return UNRECOGNIZED_PATTERNS.some((re) => re.test(explanation));
}

/**
 * Generate a simple explanation for a term in the given language (en | ur).
 * Returns { explanation: string } on success, { unrecognized: true } when GPT
 * signals the term is not a real medical term, or null on API failure.
 */
async function generateExplanation(term, language) {
  if (!OPENAI_API_KEY || !term || !term.trim()) {
    return null;
  }

  const langInstruction =
    language === 'ur'
      ? 'Explain in simple Urdu, using everyday words. Keep under 80 words.'
      : 'Explain in simple English for a patient. Keep under 80 words.';

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a medical educator. ${langInstruction} Do not diagnose. If the term is not a recognized medical term or medicine name, reply with exactly: "NOT_MEDICAL_TERM".`,
          },
          {
            role: 'user',
            content: `Term: ${term.trim()}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const explanation =
      response.data?.choices?.[0]?.message?.content?.trim() || null;

    if (!explanation) return null;

    // Check sentinel token first, then natural-language patterns.
    if (explanation === 'NOT_MEDICAL_TERM' || isUnrecognizedTerm(explanation)) {
      return { unrecognized: true };
    }

    return { explanation };
  } catch (err) {
    console.error('[medicalDictionaryService] generateExplanation error:', err.message);
    return null;
  }
}

/**
 * Ensure entry exists: if not, generate and save. Returns existing or new entry.
 * Uses a case-insensitive lookup + atomic findOneAndUpdate (upsert) to prevent
 * race-condition duplicates when concurrent processBotResponse calls arrive.
 * Returns null if the term is unrecognized or the API call fails.
 */
async function ensureEntry(userId, sessionId, term, language) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return null;

  const lang = language === 'ur' ? 'ur' : 'en';

  // Fast path: already in DB (case-insensitive).
  const existing = await MedicalDictionaryEntryModel.findOne({
    sessionId,
    term: new RegExp(`^${escapeRegex(normalizedTerm)}$`, 'i'),
  }).lean();
  if (existing) return existing;

  const result = await generateExplanation(normalizedTerm, lang);
  // null = API failure; { unrecognized } = GPT says not a medical term.
  if (!result || result.unrecognized) return null;

  // Atomic upsert: the unique index on {sessionId, term} guarantees that
  // concurrent callers resolve to one document even without a transaction.
  const entry = await MedicalDictionaryEntryModel.findOneAndUpdate(
    { sessionId, term: normalizedTerm },
    {
      $setOnInsert: {
        userId,
        sessionId,
        term: normalizedTerm,
        explanation: result.explanation,
        language: lang,
      },
    },
    { upsert: true, new: true, lean: true }
  );
  return entry;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process bot response: extract terms, generate explanations, save (no duplicates). Returns list of new entries.
 */
async function processBotResponse(userId, sessionId, botText, language) {
  const terms = await extractMedicalTerms(botText);
  if (terms.length === 0) return [];

  const lang = language === 'ur' ? 'ur' : 'en';
  const newEntries = [];

  for (const term of terms) {
    const entry = await ensureEntry(userId, sessionId, term, lang);
    if (entry) newEntries.push(entry);
  }

  return newEntries;
}

/**
 * Get all dictionary entries for a session.
 */
async function getEntriesBySession(sessionId, userId) {
  const entries = await MedicalDictionaryEntryModel.find({
    sessionId,
    userId,
  })
    .sort({ createdAt: -1 })
    .lean();
  return entries;
}

/**
 * Search: check DB first; if term not found, generate explanation and atomically
 * upsert (dedup-safe). Returns null when the term is unrecognized or API fails.
 * Callers should treat null as a 400/not-found signal rather than a 500.
 */
async function searchTerm(userId, sessionId, term, language) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return null;

  const lang = language === 'ur' ? 'ur' : 'en';

  const existing = await MedicalDictionaryEntryModel.findOne({
    sessionId,
    userId,
    term: new RegExp(`^${escapeRegex(normalizedTerm)}$`, 'i'),
  }).lean();
  if (existing) return existing;

  const result = await generateExplanation(normalizedTerm, lang);
  // null = API failure; { unrecognized } = GPT says not a medical term.
  if (!result) return null;
  if (result.unrecognized) return { unrecognized: true };

  const entry = await MedicalDictionaryEntryModel.findOneAndUpdate(
    { sessionId, term: normalizedTerm },
    {
      $setOnInsert: {
        userId,
        sessionId,
        term: normalizedTerm,
        explanation: result.explanation,
        language: lang,
      },
    },
    { upsert: true, new: true, lean: true }
  );
  return entry;
}

/**
 * Delete all dictionary entries for a session (call when session is deleted).
 */
async function clearBySession(sessionId, userId) {
  const result = await MedicalDictionaryEntryModel.deleteMany({
    sessionId,
    userId,
  });
  return result.deletedCount;
}

module.exports = {
  extractMedicalTerms,
  generateExplanation,
  ensureEntry,
  processBotResponse,
  getEntriesBySession,
  searchTerm,
  clearBySession,
};
