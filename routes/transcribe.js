const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const router = express.Router();

// Configure multer for audio file uploads
const upload = multer({
  dest: 'uploads/', // Temporary directory for uploads
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /audio\/(mpeg|wav|mp4|m4a|webm|ogg)/;
    const extname = allowedTypes.test(file.mimetype);

    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'));
    }
  }
});

router.post('/', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio file is required" });
    }

    const filePath = req.file.path;
    const language = req.body.language || 'en';

    // FORWARD TO PYTHON WHISPER SERVER (reuse VA server at 127.0.0.1:5000)
    const pythonWhisperUrl = process.env.PYTHON_WHISPER_URL || 'http://127.0.0.1:5000/transcribe';

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(filePath), { filename: req.file.originalname, contentType: req.file.mimetype });
    formData.append('language', language);

    console.log(`[transcribe.js] Forwarding audio to Python Whisper. Language: [${language}], Original Name: [${req.file.originalname}]`);

    const response = await axios.post(pythonWhisperUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 120000, // 120s timeout for transcription
    });

    const transcription = response.data.text;

    // Clean up the temporary file
    fs.unlinkSync(filePath);

    res.json({ text: transcription });
  } catch (error) {
    console.error('[transcribe.js] Error details:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : 'No response from server'
    });

    // Clean up the temporary file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }

    const details = error.response?.data?.error || error.message;
    const traceback = error.response?.data?.traceback;

    if (traceback) {
      console.error('[transcribe.js] Python Traceback:', traceback);
    }

    res.status(500).json({ error: "Transcription failed", details: details, traceback: traceback });
  }
});

module.exports = router;
