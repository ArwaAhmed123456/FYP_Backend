const express = require('express');
const { generateSpeech } = require('../services/googleTTS');

const router = express.Router();

router.post('/tts', async (req, res) => {
  try {
    const { text, language = 'en' } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    console.log(`Generating speech for text: ${text.substring(0, 50)}... (language: ${language})`);

    const audioBuffer = await generateSpeech(text, language);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Content-Disposition": "inline"
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS route error:', error.message);
    res.status(500).json({ error: "TTS generation failed", details: error.message });
  }
});

module.exports = router;
