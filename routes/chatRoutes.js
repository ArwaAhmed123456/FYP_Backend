/**
 * Chat routes: sessions, messages, send. JWT required.
 * GET    /api/chat/sessions
 * POST   /api/chat/session
 * GET    /api/chat/messages/:sessionId
 * POST   /api/chat/send
 * DELETE /api/chat/session/:sessionId
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authChat');
const chatController = require('../controller/chatController');

router.get('/sessions', authenticateToken, chatController.getSessions);
router.post('/session', authenticateToken, chatController.createSession);
router.patch('/session/:sessionId', authenticateToken, chatController.updateSession);
router.get('/messages/:sessionId', authenticateToken, chatController.getMessages);
router.post('/send', authenticateToken, chatController.sendMessage);
router.delete('/session/:sessionId', authenticateToken, chatController.deleteSession);

module.exports = router;
