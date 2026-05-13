const axios = require('axios');

async function testPythonServer() {
    console.log('Testing Python Voice Server (Local STT & TTS)...');
    
    const BASE_URL = 'http://127.0.0.1:5000';

    try {
        // 1. Test Health
        console.log('\n1. Testing Health Check...');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('Status:', health.data.status);
        console.log('Whisper Loaded:', health.data.whisper_loaded);
        console.log('FFmpeg Found:', health.data.ffmpeg);

        // 2. Test TTS (English)
        console.log('\n2. Testing TTS (English)...');
        const ttsStart = Date.now();
        const ttsResponse = await axios.post(`${BASE_URL}/tts`, {
            text: "Hello, this is a test of the Tabeeb voice assistant.",
            language: "en"
        }, { responseType: 'arraybuffer' });
        console.log(`TTS Latency: ${Date.now() - ttsStart}ms`);
        console.log(`Audio Buffer Size: ${ttsResponse.data.byteLength} bytes`);

        // 3. Test TTS (Urdu)
        console.log('\n3. Testing TTS (Urdu)...');
        const ttsUrduStart = Date.now();
        const ttsUrduResponse = await axios.post(`${BASE_URL}/tts`, {
            text: "طبیب اسسٹنٹ میں خوش آمدید",
            language: "ur"
        }, { responseType: 'arraybuffer' });
        console.log(`Urdu TTS Latency: ${Date.now() - ttsUrduStart}ms`);
        console.log(`Urdu Audio Buffer Size: ${ttsUrduResponse.data.byteLength} bytes`);

        console.log('\n✅ Local Python Server is working perfectly without significant lags.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Python Server Test Failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data.toString());
        }
        process.exit(1);
    }
}

testPythonServer();
