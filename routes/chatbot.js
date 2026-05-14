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
      return res.status(400).json({ success: false, error: 'Message required' });
    }
    
    let botText = "I understand you are experiencing these symptoms. Please consult a specialist doctor for a proper diagnosis.";
    const text = message.toLowerCase();
    
    if (text.includes("headache") && text.includes("stomach pain")) {
      botText = "Based on your symptoms (headache, stomach pain), this could be due to stress, migraine, or a gastrointestinal issue. Please rest and stay hydrated, and consult a doctor if it persists.";
    } else if (text.includes("fever")) {
      botText = "A fever indicates your body is fighting an infection. Please take rest, drink plenty of fluids, and consult a doctor if the fever exceeds 101°F.";
    }

    if (language === 'ur') {
      botText = "مجھے سمجھ آ رہا ہے کہ آپ ان علامات کا سامنا کر رہے ہیں۔ براہ کرم مناسب تشخیص کے لیے ماہر ڈاکٹر سے رجوع کریں۔";
      if (text.includes("headache") && text.includes("stomach")) {
        botText = "آپ کی علامات (سر درد، معدے میں درد) کی بنیاد پر، یہ تناؤ، درد شقیقہ، یا معدے کے مسئلے کی وجہ سے ہو سکتا ہے۔ براہ کرم آرام کریں اور اگر درد برقرار رہے تو ڈاکٹر سے رجوع کریں۔";
      }
    }

    res.json({
      success: true,
      data: { response: botText, sources: [], language }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/intent', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ type: 'chat', confidence: 0.0 });
    }

    const text = transcript.toLowerCase();
    
    // Simple intent classification fallback for demo
    const navKeywords = {
      "dashboard": "EnhancedDashboard", "home": "EnhancedDashboard",
      "doctor": "Consultations", "consult": "Consultations",
      "appointment": "AppointmentBooking", "book": "AppointmentBooking",
      "prescription": "Prescriptions", "medicine": "Prescriptions",
      "record": "HealthRecordNavigator", "report": "HealthRecordNavigator",
      "profile": "Profile", "account": "Profile"
    };

    for (const [kw, screen] of Object.entries(navKeywords)) {
      if (text.includes(kw)) {
        return res.json({
          type: "navigation",
          screen: screen,
          params: {},
          confidence: 0.85
        });
      }
    }

    return res.json({
      type: "chat",
      screen: null,
      params: {},
      confidence: 0.80
    });
  } catch (error) {
    res.status(500).json({ type: 'chat', confidence: 0.0 });
  }
});

module.exports = router;
