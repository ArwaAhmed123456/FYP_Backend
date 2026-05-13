/**
 * Voice Proxy: Node → Python Voice Server (Whisper STT + gTTS TTS)
 * English + Urdu. Requires Python server running (e.g. va/python_servers/voice_server.py on port 5000).
 * Uses backend's node_modules so require('axios') resolves when this file is loaded from backend.
 */

const axios = require('axios');
const FormData = require('form-data');

const PYTHON_VOICE_URL = process.env.PYTHON_WHISPER_URL || process.env.PYTHON_VOICE_URL || 'http://127.0.0.1:5000';
const TIMEOUT_TTS = 30000;
const TIMEOUT_STT = 120000;

/**
 * Generate speech (TTS) via Python gTTS
 * @param {string} text
 * @param {string} language - 'en' or 'ur'
 * @returns {Promise<Buffer>} MP3 buffer
 */
async function generateSpeech(text, language = 'en') {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Text cannot be empty');
  }
  const lang = language === 'ur' || language === 'ur-PK' ? 'ur' : 'en';
  const url = `${PYTHON_VOICE_URL.replace(/\/transcribe$/, '')}/tts`;
  const response = await axios.post(
    url,
    { text: text.trim(), language: lang },
    { responseType: 'arraybuffer', timeout: TIMEOUT_TTS }
  );
  return Buffer.from(response.data);
}

/**
 * Transcribe audio (STT) via Python Whisper
 * @param {Buffer} audioBuffer - Raw audio bytes
 * @param {string} language - 'en', 'ur', or 'bilingual'
 * @param {string} [filename='audio.wav'] - Filename hint for content-type
 * @returns {Promise<{ text: string }>}
 */
async function transcribeAudio(audioBuffer, language = 'en', filename = 'audio.wav') {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('Audio buffer is required');
  }
  const form = new FormData();
  form.append('audio', audioBuffer, { filename, contentType: 'audio/wav' });
  form.append('language', language === 'ur-PK' ? 'ur' : language);

  const url = `${PYTHON_VOICE_URL.replace(/\/transcribe$/, '')}/transcribe`;
  const response = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: TIMEOUT_STT,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return { text: response.data.text || '' };
}

module.exports = {
  generateSpeech,
  transcribeAudio,
  PYTHON_VOICE_URL,
};
