const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function testOpenAI() {
    console.log('Testing OpenAI Intent Detection through backend logic...');
    
    if (!OPENAI_API_KEY) {
        console.error('❌ Error: OPENAI_API_KEY not found in .env');
        process.exit(1);
    }

    try {
        // We import the intentService logic directly to test the connection
        const intentService = require('../va/backend/services/intentService');
        
        const testTranscripts = [
            "Find a doctor near me",
            "Mera nuskha dikhao",
            "I want to book an appointment",
            "AI Doctor se baat karni hai"
        ];

        for (const text of testTranscripts) {
            console.log(`\nTranscript: "${text}"`);
            const startTime = Date.now();
            const result = await intentService.detectIntent(text, { currentScreen: 'Dashboard' });
            const duration = Date.now() - startTime;
            
            console.log(`Result: ${result.type} -> ${result.screen || 'N/A'}`);
            console.log(`Confidence: ${result.confidence}`);
            console.log(`Latency: ${duration}ms`);
            
            if (result.type !== 'unknown' && result.confidence > 0.5) {
                console.log('✅ Success');
            } else {
                console.log('⚠️ Low confidence or unknown');
            }
        }

        console.log('\nVerification Complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ OpenAI Test Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

testOpenAI();
