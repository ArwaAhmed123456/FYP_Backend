/**
 * Medical_Chatbot proxy routes for Patient2.0.
 * Proxies /api/chatbot/* to the Medical_Chatbot Python server (CHATBOT_API_URL).
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const CHATBOT_API_URL = process.env.CHATBOT_API_URL || 'http://tabeeb-chatbot:5001';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function retryRequest(requestFn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      if (i === retries - 1) throw error;
      const delay = RETRY_DELAY * Math.pow(2, i);
      console.log(`[Chatbot] Retry ${i + 1}/${retries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

router.get('/health', async (req, res) => {
  try {
    const response = await retryRequest(
      () =>
        axios.get(`${CHATBOT_API_URL}/health`, {
          timeout: 120000, // 2 min for first request (model/embedding load)
          validateStatus: (status) => status < 500,
        }),
      2
    );
    res.json({
      ...response.data,
      gateway: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      gateway: 'healthy',
      chatbot_service: 'unavailable',
      error: 'Medical_Chatbot service unavailable',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/greeting', async (req, res) => {
  try {
    const response = await retryRequest(() =>
      axios.get(`${CHATBOT_API_URL}/greeting`, {
        timeout: 5000,
        validateStatus: (status) => status < 500,
      })
    );
    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    res.json({
      success: false,
      error: 'Medical_Chatbot service unavailable',
      data: {
        greeting:
          "Hello! I'm your Health Assistant. How can I help you today?",
      },
      message: error.message,
    });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { message, context, language } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
      });
    }
    if (message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty',
      });
    }

    const response = await retryRequest(() =>
      axios.post(
        `${CHATBOT_API_URL}/chat`,
        { message, context, language },
        {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      )
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        success: false,
        error: 'Medical_Chatbot service is unavailable',
        message: 'The chatbot service is not responding. Please try again in a moment.',
        retry_after: 5,
      });
    }
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        error: 'Medical_Chatbot service timeout',
        message: 'The chatbot took too long to respond. Please try again.',
        retry_after: 3,
      });
    }
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data?.error || 'Chatbot error',
        data: error.response.data,
        message: error.response.data?.message || error.response.data?.response || 'An error occurred.',
      });
    }
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again.',
    });
  }
});

router.post('/intent', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({
        type: 'chat',
        confidence: 0.0,
        error: 'Transcript is required and must be a string'
      });
    }

    const response = await retryRequest(() =>
      axios.post(
        `${CHATBOT_API_URL}/intent`,
        { transcript },
        {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      )
    );

    res.json(response.data);
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        type: 'chat',
        confidence: 0.0,
        error: 'Medical_Chatbot service is unavailable'
      });
    }
    console.error('[Chatbot INTENT] Proxy error:', error.message);
    if (error.response) {
      console.error('[Chatbot INTENT] Proxy response data:', error.response.data);
    }
    res.status(500).json({
      type: 'chat',
      confidence: 0.0,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
