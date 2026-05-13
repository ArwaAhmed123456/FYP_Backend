# Speech Services Setup Guide

This guide explains how to configure speech-to-text and text-to-speech services for the voice assistant.

## Current Implementation

The voice assistant currently uses:
- **Text-to-Speech**: `expo-speech` (built-in, works on device)
- **Speech-to-Text**: Placeholder (needs cloud service configuration)

## Speech-to-Text Providers

### Option 1: Google Cloud Speech-to-Text (Recommended)

1. **Install dependencies:**
   ```bash
   cd Patient/backend
   npm install @google-cloud/speech
   ```

2. **Set up Google Cloud:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Speech-to-Text API
   - Create a service account and download JSON key
   - Save key as `Patient/backend/config/google-speech-key.json`

3. **Add to .env:**
   ```env
   GOOGLE_CLOUD_SPEECH_KEY_PATH=./backend/config/google-speech-key.json
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   ```

4. **Update vaService.js:**
   Uncomment and configure the `transcribeWithGoogle` function.

### Option 2: AWS Transcribe

1. **Install dependencies:**
   ```bash
   cd Patient/backend
   npm install aws-sdk
   ```

2. **Set up AWS:**
   - Create AWS account
   - Create IAM user with Transcribe permissions
   - Get access key and secret

3. **Add to .env:**
   ```env
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_REGION=us-east-1
   ```

4. **Update vaService.js:**
   Uncomment and configure the `transcribeWithAWS` function.

### Option 3: Azure Speech Services

1. **Install dependencies:**
   ```bash
   cd Patient/backend
   npm install microsoft-cognitiveservices-speech-sdk
   ```

2. **Set up Azure:**
   - Create Azure account
   - Create Speech resource
   - Get subscription key and region

3. **Add to .env:**
   ```env
   AZURE_SPEECH_KEY=your-subscription-key
   AZURE_SPEECH_REGION=your-region
   ```

4. **Update vaService.js:**
   Uncomment and configure the `transcribeWithAzure` function.

## Text-to-Speech

Currently using `expo-speech` which works on-device. For cloud-based TTS:

### Google Cloud Text-to-Speech

1. **Install:**
   ```bash
   npm install @google-cloud/text-to-speech
   ```

2. **Configure:**
   - Use same Google Cloud project
   - Enable Text-to-Speech API
   - Use same service account key

### AWS Polly

1. **Install:**
   ```bash
   npm install aws-sdk
   ```

2. **Configure:**
   - Use same AWS credentials
   - Polly is included in AWS SDK

## Testing

After configuration, test with:
```bash
cd Patient/backend
node test_va_endpoints.js
```

The transcription endpoint should return actual transcribed text instead of placeholder.

## Notes

- Google Cloud offers free tier: 60 minutes/month
- AWS Transcribe offers free tier: 60 minutes/month
- Azure offers free tier: 5 hours/month
- For production, consider implementing caching and rate limiting

