/**
 * Voice Audio Service (no conversational orchestration)
 *
 * This module now only exposes low-level transcription and synthesis helpers
 * used by the remaining `/api/va/transcribe` and `/api/va/synthesize` endpoints.
 */

const { generateSpeech: proxyTTS, transcribeAudio: proxySTT } = require('./voiceProxy');
const VoiceLog = require('../../../models/VoiceLogModel');

/**
 * Transcribe audio to text (English + Urdu via Python Whisper)
 * Accepts base64 or buffer. Requires Python voice server running (see va/python_servers/voice_server.py).
 */
exports.transcribeAudio = async (userId, audioData) => {
  try {
    const { audio, format, language } = audioData;

    let audioBuffer;
    if (typeof audio === 'string') {
      audioBuffer = Buffer.from(audio, 'base64');
    } else if (audio && audio.buffer) {
      audioBuffer = Buffer.from(audio.buffer);
    } else if (Buffer.isBuffer(audio)) {
      audioBuffer = audio;
    } else {
      throw new Error('Invalid audio data format: provide base64 string or buffer');
    }

    const lang = language === 'ur-PK' ? 'ur' : (language || 'en');
    const filename = `audio.${format === 'm4a' ? 'm4a' : format || 'wav'}`;
    const { text } = await proxySTT(audioBuffer, lang, filename);

    return {
      text: text || '',
      language: lang,
      confidence: 1.0,
      provider: 'whisper'
    };
  } catch (error) {
    console.error('[VA Service] Error transcribing audio:', error.message);
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Voice server is not running at http://127.0.0.1:5000');
    }
    throw error;
  }
};

/**
 * Synthesize text to speech (English + Urdu via Python gTTS)
 * Requires Python voice server running (see va/python_servers/voice_server.py).
 */
exports.synthesizeSpeech = async (userId, { text, language = 'en', voice = 'default' }) => {
  try {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Text is required for synthesis');
    }
    const lang = language === 'ur-PK' ? 'ur' : (language || 'en');
    const audioBuffer = await proxyTTS(text.trim(), lang);
    const audioBase64 = audioBuffer.toString('base64');
    return {
      audioUrl: '',
      audioBase64,
      format: 'mp3',
      duration: 0
    };
  } catch (error) {
    console.error('[VA Service] Error synthesizing speech:', error.message);
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Voice server is not running. Start Python voice server: python va/python_servers/voice_server.py');
    }
    throw error;
  }
};

/**
 * Get stored command history from voice logs
 */
exports.getCommandHistory = async (userId, options = {}) => {
  if (!userId) {
    return [];
  }
  const limit = Number(options.limit) || 50;
  const offset = Number(options.offset) || 0;
  return VoiceLog.find({ patientId: userId })
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
};

/**
 * Clear user's voice command history
 */
exports.clearCommandHistory = async (userId) => {
  if (!userId) {
    return;
  }
  await VoiceLog.deleteMany({ patientId: userId });
};

