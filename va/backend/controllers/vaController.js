/**
 * Voice Assistant Controller
 *
 * Handles both conversational orchestration and low-level audio services.
 */

const vaService = require('../services/vaService');
const VoiceLog = require('../../../models/VoiceLogModel');

/**
 * Transcribe audio to text
 */
exports.transcribe = async (req, res) => {
  try {
    // Handle audio data from request body (base64 encoded)
    const { audio, format, language, provider } = req.body;

    if (!audio) {
      return res.status(400).json({
        success: false,
        error: 'Audio data is required (base64 encoded)'
      });
    }

    const transcription = await vaService.transcribeAudio(null, {
      audio,
      format: format || 'm4a',
      language: language || 'en'
    });

    res.json({
      success: true,
      data: {
        text: transcription.text,
        confidence: transcription.confidence,
        language: transcription.language,
        provider: transcription.provider
      }
    });
  } catch (error) {
    console.error('[VA Controller] Error transcribing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transcribe audio',
      message: error.message
    });
  }
};

/**
 * Synthesize text to speech
 */
exports.synthesize = async (req, res) => {
  try {
    const { text, language, voice } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text is required and must be a string'
      });
    }

    const audioData = await vaService.synthesizeSpeech(null, {
      text,
      language: language || 'en',
      voice: voice || 'default'
    });

    res.json({
      success: true,
      data: {
        audio: audioData.audioBase64 || audioData.audioUrl,
        format: audioData.format || 'mp3',
        duration: audioData.duration
      }
    });
  } catch (error) {
    console.error('[VA Controller] Error synthesizing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to synthesize speech',
      message: error.message
    });
  }
};

/**
 * Voice assistant health check
 */
exports.health = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'ok',
        message: 'Voice Assistant routes are available'
      }
    });
  } catch (error) {
    console.error('[VA Controller] Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Voice Assistant health check failed',
      message: error.message
    });
  }
};

/**
 * Initialize voice assistant for user
 */
exports.initialize = async (req, res) => {
  try {
    const { language, voiceEnabled } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const settings = {
      language: language || 'en',
      voiceEnabled: voiceEnabled === true,
      initialized: true,
      updatedAt: new Date().toISOString()
    };

    if (!exports.userVoiceSettings) {
      exports.userVoiceSettings = new Map();
    }
    exports.userVoiceSettings.set(String(userId), settings);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('[VA Controller] Initialize failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize voice assistant',
      message: error.message
    });
  }
};

/**
 * Get voice assistant status for user
 */
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const settings = (exports.userVoiceSettings && exports.userVoiceSettings.get(String(userId))) || {
      language: 'en',
      voiceEnabled: false,
      initialized: false
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('[VA Controller] Status failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get voice assistant status',
      message: error.message
    });
  }
};

/**
 * Process a spoken command and return the intent result
 */
exports.processCommand = async (req, res) => {
  try {
    const { command, context } = req.body;
    const transcript = typeof command === 'string' && command.trim().length > 0 ? command : req.body.transcript;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Command is required and must be a string'
      });
    }

    const intentService = require('../services/intentService');
    const result = await intentService.detectIntent(transcript, context);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[VA Controller] Process command failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process command',
      message: error.message
    });
  }
};

/**
 * Get command history for user
 */
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = await vaService.getCommandHistory(userId, { limit, offset });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[VA Controller] Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get command history',
      message: error.message
    });
  }
};

/**
 * Clear command history for user
 */
exports.clearHistory = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    await vaService.clearCommandHistory(userId);

    res.json({
      success: true,
      message: 'Command history cleared successfully'
    });
  } catch (error) {
    console.error('[VA Controller] Error clearing history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear command history',
      message: error.message
    });
  }
};

/**
 * Detect Intent using Smart Router (OpenAI)
 */
exports.detectIntent = async (req, res) => {
  try {
    const { transcript, context } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({
        type: 'chat',
        confidence: 0.0,
        error: 'Transcript is required and must be a string'
      });
    }

    const intentService = require('../services/intentService');
    const result = await intentService.detectIntent(transcript, context);

    res.json(result);
  } catch (error) {
    console.error('[VA Controller] Error detecting intent:', error);
    res.status(500).json({
      type: 'chat',
      confidence: 0.0,
      error: 'Internal server error while processing intent'
    });
  }
};

/**
 * Get current AI cost information
 */
exports.getCost = async (req, res) => {
  try {
    const intentService = require('../services/intentService');
    const costInfo = intentService.getCostInfo();
    res.json({
      success: true,
      data: costInfo,
      limit: parseFloat(process.env.VA_INTENT_BUDGET_USD || '1.00')
    });
  } catch (error) {
    console.error('[VA Controller] Error getting cost:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost information'
    });
  }
};

/**
 * Reset AI cost counter (admin use)
 */
exports.resetCost = async (req, res) => {
  try {
    const intentService = require('../services/intentService');
    intentService.resetCost();
    res.json({ success: true, message: 'Cost data reset successfully.' });
  } catch (error) {
    console.error('[VA Controller] Error resetting cost:', error);
    res.status(500).json({ success: false, error: 'Failed to reset cost data' });
  }
};

/**
 * Log voice interaction for continuous learning
 */
exports.logInteraction = async (req, res) => {
  try {
    const { logs } = req.body;
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({
        success: false,
        error: 'Logs array is required'
      });
    }

    const patientId = req.user?.userId || req.user?.id;

    const logEntries = logs.map(log => ({
      ...log,
      patientId: patientId || null,
      timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
    }));

    await VoiceLog.insertMany(logEntries);

    res.json({
      success: true,
      message: `${logs.length} interactions logged successfully`
    });
  } catch (error) {
    console.error('[VA Controller] Error logging interactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log interactions',
      message: error.message
    });
  }
};

/**
 * Get voice logs for review (Continuous Learning)
 */
exports.getLogs = async (req, res) => {
  try {
    const { limit = 100, skip = 0, unknownOnly = false } = req.query;
    const query = unknownOnly === 'true' ? { intent: 'UNKNOWN' } : {};

    const logs = await VoiceLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await VoiceLog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      total
    });
  } catch (error) {
    console.error('[VA Controller] Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logs'
    });
  }
};
