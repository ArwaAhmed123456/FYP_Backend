/**
 * Chat controller: sessions, messages, send (proxy to Flask). JWT required.
 */
const chatService = require('../services/chatService');
const medicalDictionaryService = require('../services/medicalDictionaryService');
const ChatSessionModel = require('../models/ChatSessionModel');
const mongoose = require('mongoose');

async function getSessions(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const sessions = await chatService.getSessions(userId);
    return res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (err) {
    console.error('[chatController] getSessions:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function createSession(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { title, language } = req.body || {};
    const session = await chatService.createSession(userId, {
      title: title || 'New chat',
      language: language === 'ur' ? 'ur' : 'en',
    });
    return res.status(201).json({
      success: true,
      data: session,
    });
  } catch (err) {
    console.error('[chatController] createSession:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function updateSession(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Valid sessionId is required',
      });
    }

    const { language, title } = req.body || {};
    const update = {};
    if (language === 'ur' || language === 'en') update.language = language;
    if (typeof title === 'string' && title.trim()) update.title = title.trim();
    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'At least one field (e.g. language or title) is required',
      });
    }

    const session = await chatService.updateSession(sessionId, userId, update);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Session not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (err) {
    console.error('[chatController] updateSession:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function getMessages(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Valid sessionId is required',
      });
    }

    const messages = await chatService.getMessages(sessionId, userId);
    if (messages === null) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Session not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (err) {
    console.error('[chatController] getMessages:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function sendMessage(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { sessionId, message, isVoice, language: bodyLanguage } = req.body || {};
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Valid sessionId is required',
      });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Message is required and must be a non-empty string',
      });
    }

    const lang = bodyLanguage === 'ur' ? 'ur' : bodyLanguage === 'en' ? 'en' : undefined;
    const result = await chatService.sendMessage(
      userId,
      sessionId,
      message.trim(),
      Boolean(isVoice),
      lang
    );

    const newDictionaryEntries = await medicalDictionaryService.processBotResponse(
      userId,
      sessionId,
      result.response,
      result.sessionLanguage
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`session:${sessionId}`).emit('chat:newMessage', {
        sessionId,
        userMessage: result.userMessage,
        botMessage: result.botMessage,
      });
      if (newDictionaryEntries.length > 0) {
        io.to(`session:${sessionId}`).emit('dictionary:update', {
          sessionId,
          entries: newDictionaryEntries,
        });
      }
      if (result.newTitle) {
        io.to(`session:${sessionId}`).emit('session:titleUpdated', {
          sessionId,
          title: result.newTitle,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        userMessage: result.userMessage,
        botMessage: result.botMessage,
        response: result.response,
        sources: result.sources,
        dictionaryEntries: newDictionaryEntries,
        newTitle: result.newTitle || undefined,
      },
    });
  } catch (err) {
    if (err.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Session not found',
      });
    }
    console.error('[chatController] sendMessage:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function deleteSession(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Valid sessionId is required',
      });
    }

    await medicalDictionaryService.clearBySession(sessionId, userId);
    const deleted = await chatService.deleteSession(sessionId, userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Session not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { deleted: true },
    });
  } catch (err) {
    console.error('[chatController] deleteSession:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

module.exports = {
  getSessions,
  createSession,
  updateSession,
  getMessages,
  sendMessage,
  deleteSession,
};
