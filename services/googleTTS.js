const axios = require('axios');

/**
 * Generate speech using Local Python TTS Server (gTTS)
 * Proxies request to python_whisper_server.py running on port 5000
 */
async function generateSpeech(text, language = 'en') {
  try {
    // Validate inputs
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Python server endpoint - reuse VA server at 127.0.0.1:5000
    const pythonServerUrl = process.env.PYTHON_TTS_URL || 'http://127.0.0.1:5000/tts';

    console.log(`[Node] Requesting TTS from Python server: ${text.substring(0, 30)}... (${language})`);

    const response = await axios.post(pythonServerUrl, {
      text,
      language
    }, {
      responseType: 'arraybuffer' // Important for binary audio data
    });

    return response.data;
  } catch (error) {
    console.error('Local TTS Proxy error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Python TTS server is not running on port 5000. Please start python_whisper_server.py');
    }
    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

module.exports = {
  generateSpeech
};
