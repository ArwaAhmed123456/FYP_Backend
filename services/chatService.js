/**
 * Chat service: sessions, messages, proxy to Medical_Chatbot Flask. No changes to Python service.
 */
const axios = require('axios');
const ChatSessionModel = require('../models/ChatSessionModel');
const ChatMessageModel = require('../models/ChatMessageModel');

const CHATBOT_API_URL = process.env.CHATBOT_API_URL || 'http://localhost:5001';
const URDU_PREFIX = 'Please respond in Urdu language.\n\n';

const DEFAULT_TITLES = ['New chat', 'New Chat', 'نیا چیٹ'];

/**
 * Generate a short title from the first user message (no AI).
 */
function generateChatTitle(message, language) {
  if (!message || typeof message !== 'string') return 'New chat';
  const cleaned = message.trim();
  if (!cleaned) return 'New chat';
  let title = cleaned.substring(0, 50);
  if (cleaned.length > 50) {
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 20) title = title.substring(0, lastSpace);
    title += '...';
  }
  if (language === 'en' && title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title || 'New chat';
}

/**
 * Build message to send to Flask: if session language is 'ur', prepend Urdu instruction.
 */
function buildMessageForFlask(message, language) {
  if (language === 'ur') {
    return URDU_PREFIX + message;
  }
  return message;
}

/**
 * List sessions for user, newest first.
 */
async function getSessions(userId) {
  const sessions = await ChatSessionModel.find({ userId })
    .sort({ updatedAt: -1 })
    .lean();
  return sessions;
}

/**
 * Create a new chat session.
 */
async function createSession(userId, options = {}) {
  const { title = 'New chat', language = 'en' } = options;
  const session = await ChatSessionModel.create({
    userId,
    title,
    language: language === 'ur' ? 'ur' : 'en',
  });
  return session.toObject();
}

/**
 * Get session by id; ensure it belongs to userId.
 */
async function getSessionById(sessionId, userId) {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    userId,
  }).lean();
  return session;
}

/**
 * Update session (e.g. language). Returns updated session.
 */
async function updateSession(sessionId, userId, update) {
  const session = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: { ...update, updatedAt: new Date() } },
    { new: true, runValidators: true }
  ).lean();
  return session;
}

/**
 * Get messages for a session.
 */
async function getMessages(sessionId, userId) {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    userId,
  });
  if (!session) return null;

  const messages = await ChatMessageModel.find({ sessionId })
    .sort({ createdAt: 1 })
    .lean();
  return messages;
}

/**
 * Proxy to Flask /chat and store user + bot messages. Returns bot response and saved messages.
 * If requestLanguage is provided ('en'|'ur'), use it for this message and sync session.language.
 */
async function sendMessage(userId, sessionId, message, isVoice = false, requestLanguage = null) {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    userId,
  });
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }

  const lang = requestLanguage === 'ur' || requestLanguage === 'en' ? requestLanguage : session.language;
  if (requestLanguage && requestLanguage !== session.language) {
    await ChatSessionModel.updateOne(
      { _id: sessionId, userId },
      { $set: { language: requestLanguage, updatedAt: new Date() } }
    );
  }

  const messageToFlask = buildMessageForFlask(message, lang);

  let flaskResponse;
  try {
    flaskResponse = await axios.post(
      `${CHATBOT_API_URL}/chat`,
      { message: messageToFlask, context: {} },
      {
        timeout: 120000, // 2 min - Medical_Chatbot can be slow on first request (model/embedding load)
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (s) => s < 500,
      }
    );
  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    const isUnreachable = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
    let botText = 'Sorry, the health assistant is taking too long or is unavailable. Please ensure the Medical_Chatbot service is running (python app.py --server) and try again.';
    if (isUnreachable) {
      botText = 'The health assistant service is not reachable. Please start the Medical_Chatbot server and try again.';
    }
    const userMsg = await ChatMessageModel.create({
      sessionId,
      sender: 'user',
      message,
      isVoice,
    });
    const botMsg = await ChatMessageModel.create({
      sessionId,
      sender: 'bot',
      message: botText,
      isVoice: false,
    });
    await ChatSessionModel.updateOne(
      { _id: sessionId },
      { $set: { updatedAt: new Date() } }
    );
    let newTitle = null;
    const sessionAfterErr = await ChatSessionModel.findById(sessionId).lean();
    const defaultTitleErr =
      !sessionAfterErr?.title ||
      sessionAfterErr.title.trim() === '' ||
      DEFAULT_TITLES.includes(sessionAfterErr.title);
    const needsNaming =
      sessionAfterErr && defaultTitleErr && message && message.trim();
    if (needsNaming) {
      newTitle = generateChatTitle(message.trim(), lang);
      await ChatSessionModel.updateOne(
        { _id: sessionId },
        { $set: { title: newTitle, updatedAt: new Date() } }
      );
    }
    return {
      userMessage: userMsg.toObject(),
      botMessage: botMsg.toObject(),
      response: botText,
      sources: [],
      sessionLanguage: lang,
      newTitle: newTitle || undefined,
    };
  }

  let botText = '';
  let sources = [];
  if (flaskResponse.status === 200 && flaskResponse.data) {
    botText = flaskResponse.data.response || flaskResponse.data.answer || '';
    sources = flaskResponse.data.sources || [];
  } else {
    botText =
      flaskResponse.data?.response ||
      flaskResponse.data?.error ||
      'Sorry, the assistant is temporarily unavailable. Please try again.';
  }

  const userMsg = await ChatMessageModel.create({
    sessionId,
    sender: 'user',
    message,
    isVoice,
  });

  const botMsg = await ChatMessageModel.create({
    sessionId,
    sender: 'bot',
    message: botText,
    isVoice: false,
  });

  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { updatedAt: new Date() } }
  );

  let newTitle = null;
  const sessionAfter = await ChatSessionModel.findById(sessionId).lean();
  const defaultTitle =
    !sessionAfter?.title ||
    sessionAfter.title.trim() === '' ||
    DEFAULT_TITLES.includes(sessionAfter.title);
  const needsNaming = sessionAfter && defaultTitle && message && message.trim();
  if (needsNaming) {
    newTitle = generateChatTitle(message.trim(), lang);
    await ChatSessionModel.updateOne(
      { _id: sessionId },
      { $set: { title: newTitle, updatedAt: new Date() } }
    );
  }

  return {
    userMessage: userMsg.toObject(),
    botMessage: botMsg.toObject(),
    response: botText,
    sources,
    sessionLanguage: lang,
    newTitle: newTitle || undefined,
  };
}

/**
 * Delete a session and its messages (and dictionary entries are cleared by medical-dictionary service).
 */
async function deleteSession(sessionId, userId) {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    userId,
  });
  if (!session) return false;

  await ChatMessageModel.deleteMany({ sessionId });
  await ChatSessionModel.deleteOne({ _id: sessionId });
  return true;
}

module.exports = {
  getSessions,
  createSession,
  getSessionById,
  updateSession,
  getMessages,
  sendMessage,
  deleteSession,
  buildMessageForFlask,
};
