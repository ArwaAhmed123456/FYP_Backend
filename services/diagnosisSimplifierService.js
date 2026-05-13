/**
 * Diagnosis Simplifier Service
 *
 * For English text: computes a Flesch-Kincaid Reading Ease score.
 *   - If score >= 50 (already readable) → wasSimplified: false, no API call.
 *   - If score < 50 (complex) → ask GPT to simplify, return simplified text.
 *
 * For Urdu text: skip scoring (readabilityScore = null), always ask GPT to
 *   assess complexity and simplify if needed. Detect change by comparing
 *   normalised strings.
 */
const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ---------------------------------------------------------------------------
// Flesch-Kincaid helpers (English only)
// ---------------------------------------------------------------------------

/**
 * Count syllables in a single English word using a heuristic.
 * Handles common edge cases (silent-e, consecutive vowels, -le endings).
 */
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  // Remove trailing 'e' (silent-e rule)
  const stripped = w.replace(/e$/, '');
  const matches = stripped.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;

  // Adjust for common suffixes
  if (w.endsWith('le') && w.length > 2 && !'aeiou'.includes(w[w.length - 3])) count += 1;
  if (w.endsWith('les') && w.length > 3 && !'aeiou'.includes(w[w.length - 4])) count += 1;

  return Math.max(1, count);
}

/**
 * Compute the Flesch-Kincaid Reading Ease score for English text.
 * Formula: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 * Returns null when there is not enough text to score (< 3 words).
 */
function computeFleschKincaid(text) {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 3) return null;

  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllableCount / words.length);
  // Clamp to [0, 100] — the scale is theoretically unbounded at the extremes.
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

// ---------------------------------------------------------------------------
// GPT simplification
// ---------------------------------------------------------------------------

/**
 * Ask GPT to rewrite `text` in simple language for the given language ('english' | 'urdu').
 * Returns the simplified string, or null on API failure.
 */
async function simplifyWithGPT(text, language) {
  if (!OPENAI_API_KEY) {
    console.error('[diagnosisSimplifierService] OPENAI_API_KEY not set');
    return null;
  }

  const langInstruction =
    language === 'urdu'
      ? 'Rewrite the following medical text in simple, everyday Urdu that a patient with no medical background can understand. Keep all important information. Return only the rewritten text, no other content.'
      : 'Rewrite the following medical text in simple, everyday English (aim for a Flesch-Kincaid Reading Ease score above 60). Use short sentences and common words. Keep all important information. Return only the rewritten text, no other content.';

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: langInstruction },
          { role: 'user', content: text.substring(0, 8000) },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const simplified = response.data?.choices?.[0]?.message?.content?.trim() || null;
    return simplified;
  } catch (err) {
    console.error('[diagnosisSimplifierService] simplifyWithGPT error:', err.message);
    return null;
  }
}

/**
 * For Urdu: ask GPT to simplify and detect if any change was made.
 * Returns { simplified: string, changed: boolean } or null on failure.
 */
async function simplifyUrduWithGPT(text) {
  const simplified = await simplifyWithGPT(text, 'urdu');
  if (!simplified) return null;

  // Normalise both strings (collapse whitespace, trim) before comparing.
  const normalise = (s) => s.replace(/\s+/g, ' ').trim();
  const changed = normalise(simplified) !== normalise(text);
  return { simplified, changed };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Analyse and optionally simplify OCR text.
 *
 * @param {string} ocrText  - Raw OCR text from the scanned document.
 * @param {string} language - 'english' | 'urdu'
 * @returns {{ readabilityScore: number|null, simplifiedText: string, wasSimplified: boolean }}
 */
async function analyzeAndSimplify(ocrText, language) {
  const result = {
    readabilityScore: null,
    simplifiedText: '',
    wasSimplified: false,
  };

  if (!ocrText || ocrText.trim().length === 0) {
    return result;
  }

  const lang = language === 'urdu' ? 'urdu' : 'english';

  if (lang === 'english') {
    const score = computeFleschKincaid(ocrText);
    result.readabilityScore = score;

    // Only simplify when score is computable and below the readability threshold.
    if (score !== null && score < 50) {
      const simplified = await simplifyWithGPT(ocrText, 'english');
      if (simplified && simplified.length > 0) {
        result.simplifiedText = simplified;
        result.wasSimplified = true;
      }
    }
  } else {
    // Urdu path — skip FK scoring, let GPT handle complexity detection.
    const urduResult = await simplifyUrduWithGPT(ocrText);
    if (urduResult) {
      result.simplifiedText = urduResult.simplified;
      result.wasSimplified = urduResult.changed;
    }
  }

  return result;
}

module.exports = { analyzeAndSimplify };
