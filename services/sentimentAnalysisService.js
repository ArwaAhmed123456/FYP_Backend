/**
 * Sentiment Analysis Service
 * Wrapper to call Python sentiment analysis service
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SENTIMENT_SCRIPT_PATH = path.join(__dirname, 'sentimentAnalysisService.py');
const PYTHON_COMMAND = process.env.PYTHON_COMMAND || 'python'; // Can be 'python3' on some systems

/**
 * Analyze sentiment of feedback text
 * @param {string} text - Feedback text to analyze
 * @param {boolean} useDeepLearning - Whether to use DL model (default: false, uses ML)
 * @returns {Promise<{label: string, score: number, confidence: number}>}
 */
async function analyzeSentiment(text, useDeepLearning = false) {
  return new Promise((resolve, reject) => {
    if (!text || typeof text !== 'string') {
      return resolve({
        label: 'Neutral',
        score: 0.5,
        confidence: 0.5
      });
    }

    // Check if Python script exists
    if (!fs.existsSync(SENTIMENT_SCRIPT_PATH)) {
      console.warn('⚠️ Sentiment analysis script not found, using fallback');
      return resolve(fallbackSentimentAnalysis(text));
    }

    const inputData = JSON.stringify({
      text: text.trim(),
      use_dl: useDeepLearning
    });

    const pythonProcess = spawn(PYTHON_COMMAND, [SENTIMENT_SCRIPT_PATH], {
      cwd: path.dirname(SENTIMENT_SCRIPT_PATH),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Sentiment analysis failed with code ${code}: ${stderr}`);
        // Use fallback on error
        return resolve(fallbackSentimentAnalysis(text));
      }

      try {
        const result = JSON.parse(stdout.trim());
        // Normalize output format to match spec
        // Python may return 'label' or 'sentiment_label', normalize to 'label'
        const normalizedResult = {
          label: result.sentiment_label || result.label || 'Neutral',
          score: parseFloat(result.sentiment_score || result.score || 0.5),
          confidence: parseFloat(result.confidence || 0.5)
        };
        // Ensure label is capitalized (Positive, Neutral, Negative)
        normalizedResult.label = normalizedResult.label.charAt(0).toUpperCase() + normalizedResult.label.slice(1).toLowerCase();
        resolve(normalizedResult);
      } catch (error) {
        console.error('❌ Error parsing sentiment analysis result:', error);
        resolve(fallbackSentimentAnalysis(text));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ Error spawning Python process:', error.message);
      resolve(fallbackSentimentAnalysis(text));
    });

    // Send input
    pythonProcess.stdin.write(inputData);
    pythonProcess.stdin.end();
  });
}

/**
 * Fallback simple sentiment analysis using keywords
 * Used when Python service is unavailable
 */
function fallbackSentimentAnalysis(text) {
  const positiveWords = [
    'good', 'great', 'excellent', 'amazing', 'wonderful',
    'helpful', 'professional', 'satisfied', 'happy', 'love',
    'best', 'fantastic', 'outstanding', 'perfect', 'brilliant'
  ];
  
  const negativeWords = [
    'bad', 'terrible', 'awful', 'poor', 'disappointed',
    'unhappy', 'worst', 'horrible', 'hate', 'disgusting',
    'useless', 'waste', 'pathetic'
  ];

  const textLower = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  positiveWords.forEach(word => {
    if (textLower.includes(word)) positiveCount++;
  });

  negativeWords.forEach(word => {
    if (textLower.includes(word)) negativeCount++;
  });

  if (positiveCount > negativeCount) {
    return {
      label: 'Positive',
      score: 0.7,
      confidence: Math.min(0.5 + (positiveCount * 0.1), 0.9)
    };
  } else if (negativeCount > positiveCount) {
    return {
      label: 'Negative',
      score: 0.3,
      confidence: Math.min(0.5 + (negativeCount * 0.1), 0.9)
    };
  } else {
    return {
      label: 'Neutral',
      score: 0.5,
      confidence: 0.5
    };
  }
}

/**
 * Sanitize feedback text to prevent XSS
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeFeedbackText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove HTML tags
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Remove script tags and event handlers
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, 2000);
  
  return sanitized;
}

module.exports = {
  analyzeSentiment,
  fallbackSentimentAnalysis,
  sanitizeFeedbackText
};

