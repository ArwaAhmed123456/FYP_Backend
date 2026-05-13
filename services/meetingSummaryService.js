/**
 * Meeting Summary Service
 * Fetches call transcripts from the transcription gateway and generates
 * structured consultation summaries using OpenAI.
 */
const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TRANSCRIPTION_GATEWAY_URL =
  process.env.TRANSCRIPTION_GATEWAY_URL || 'http://localhost:4001';

/**
 * Fetch the transcript for a given callId from the transcription gateway.
 * Returns array of { speaker, text, timestamp }.
 */
async function fetchTranscript(callId) {
  if (!callId) return [];

  try {
    const url = `http://${TRANSCRIPTION_GATEWAY_URL.replace(/^https?:\/\//, '')}/api/transcript/${callId}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data.transcript)) {
      return response.data.transcript;
    }
    return [];
  } catch (err) {
    console.error('[meetingSummaryService] fetchTranscript error:', err.message);
    return [];
  }
}

/**
 * Format transcript entries into a readable string for the LLM prompt.
 */
function formatTranscriptForPrompt(transcript) {
  return transcript
    .map((entry) => `${entry.speaker === 'doctor' ? 'Doctor' : 'Patient'}: ${entry.text}`)
    .join('\n');
}

/**
 * Coerce a raw GPT-parsed object into the exact shape the schema expects:
 * all 6 summary fields must be strings. GPT-4o-mini sometimes returns arrays
 * for list-like fields (symptomsDiscussed, prescriptions) — join them.
 */
function coerceSummaryFields(parsed) {
  function toStr(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }
  return {
    overview: toStr(parsed.overview),
    symptomsDiscussed: toStr(parsed.symptomsDiscussed),
    diagnosis: toStr(parsed.diagnosis),
    prescriptions: toStr(parsed.prescriptions),
    followUpPlan: toStr(parsed.followUpPlan),
    additionalNotes: toStr(parsed.additionalNotes),
  };
}

/**
 * Generate a structured consultation summary using OpenAI.
 * @param {Array} transcript - Array of { speaker, text, timestamp }
 * @param {string} language - 'en' or 'ur'
 * @returns {Object|null} Structured summary or null on failure
 */
async function generateSummary(transcript, language = 'en') {
  if (!OPENAI_API_KEY) {
    console.error('[meetingSummaryService] OPENAI_API_KEY not configured');
    return null;
  }

  if (!transcript || transcript.length === 0) {
    return null;
  }

  const formattedTranscript = formatTranscriptForPrompt(transcript);

  const langInstruction =
    language === 'ur'
      ? 'Write the summary entirely in Urdu using simple, everyday language that a patient can understand.'
      : 'Write the summary in clear, simple English that a patient can easily understand.';

  const systemPrompt = `You are a medical consultation summarizer. Given a transcript of a doctor-patient video consultation, produce a structured summary. ${langInstruction}

Return a JSON object with exactly these keys:
- "overview": A 2-3 sentence overview of the consultation.
- "symptomsDiscussed": List of symptoms the patient mentioned or the doctor asked about.
- "diagnosis": The doctor's assessment or diagnosis (if discussed). If not discussed, say so.
- "prescriptions": Any medications, treatments, or lifestyle recommendations mentioned.
- "followUpPlan": Any follow-up appointments, tests, or next steps discussed.
- "additionalNotes": Any other important points from the consultation.

Return ONLY valid JSON, no other text.`;

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: formattedTranscript.substring(0, 12000) },
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

    const content =
      response.data?.choices?.[0]?.message?.content?.trim() || '';

    try {
      const parsed = JSON.parse(content);
      return coerceSummaryFields(parsed);
    } catch (parseErr) {
      // Try to extract JSON from the response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return coerceSummaryFields(parsed);
        } catch (e2) {
          console.error('[meetingSummaryService] Failed to parse extracted JSON:', e2.message);
        }
      }
      console.error('[meetingSummaryService] Failed to parse OpenAI response:', parseErr.message);
      return null;
    }
  } catch (err) {
    console.error('[meetingSummaryService] generateSummary error:', err.message);
    return null;
  }
}

module.exports = {
  fetchTranscript,
  generateSummary,
};
