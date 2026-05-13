/**
 * Medical dictionary controller: get by session, search, clear. JWT required.
 */
const medicalDictionaryService = require('../services/medicalDictionaryService');
const mongoose = require('mongoose');

async function getBySession(req, res) {
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

    const entries = await medicalDictionaryService.getEntriesBySession(
      sessionId,
      userId
    );
    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (err) {
    console.error('[medicalDictionaryController] getBySession:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function search(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const { sessionId, term } = req.body || {};
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Valid sessionId is required',
      });
    }
    if (!term || typeof term !== 'string' || term.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Term is required',
      });
    }

    const session = await require('../services/chatService').getSessionById(
      sessionId,
      userId
    );
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Session not found',
      });
    }

    const entry = await medicalDictionaryService.searchTerm(
      userId,
      sessionId,
      term.trim(),
      session.language
    );

    // null = API/DB failure; { unrecognized } = not a medical term.
    if (!entry) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to look up term',
      });
    }
    if (entry.unrecognized) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Term not recognized as a valid medical term',
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`session:${sessionId}`).emit('dictionary:update', {
        sessionId,
        entries: [entry],
      });
    }

    return res.status(200).json({
      success: true,
      data: entry,
    });
  } catch (err) {
    console.error('[medicalDictionaryController] search:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

async function clearSession(req, res) {
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

    const deleted = await medicalDictionaryService.clearBySession(
      sessionId,
      userId
    );
    return res.status(200).json({
      success: true,
      data: { deletedCount: deleted },
    });
  } catch (err) {
    console.error('[medicalDictionaryController] clearSession:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
}

module.exports = {
  getBySession,
  search,
  clearSession,
};
