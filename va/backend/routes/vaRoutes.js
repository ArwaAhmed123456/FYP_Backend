/**
 * Voice Assistant Routes
 * 
 * Integrated into Patient/va/backend/routes/
 * 
 * Routes:
 * - /health - VA Health check
 * - /status - User VA status
 * - /initialize - Initialize VA settings
 * - /process-command - Core conversational orchestration
 * - /history - Command history
 * - /transcribe - STT
 * - /synthesize - TTS
 */

// Note: Resolve express from Patient/backend/node_modules
// Updated import path from /va to Patient/va structure
// Since va folder is outside backend, we need to resolve from backend's node_modules
// From Patient/va/backend/routes, go up 3 levels to Patient, then into backend/node_modules
const path = require('path');
const fs = require('fs');
const backendNodeModules = path.resolve(__dirname, '../../../backend/node_modules');
// Directly require express from backend's node_modules
// Check if express exists, then require it
const expressPath = path.join(backendNodeModules, 'express');
if (!fs.existsSync(expressPath)) {
  throw new Error(`Cannot find express at ${expressPath}. Please ensure dependencies are installed in Patient/backend.`);
}
const express = require(expressPath);
const router = express.Router();
const vaController = require('../controllers/vaController');
const { authenticateToken } = require('../../../backend/middleware/authChat');

// Voice assistant orchestration endpoints
router.get('/health', vaController.health);
router.get('/status', authenticateToken, vaController.getStatus);
router.post('/initialize', authenticateToken, vaController.initialize);
router.post('/process-command', authenticateToken, vaController.processCommand);
router.get('/history', authenticateToken, vaController.getHistory);

// Low-level VA audio endpoints (Unauthenticated to allow use on Login/SignUp)
router.post('/transcribe', vaController.transcribe);
router.post('/synthesize', vaController.synthesize);
// Allow unauthenticated intent detection so login/signup voice commands work before user auth.
router.post('/intent', vaController.detectIntent);
router.post('/log', authenticateToken, vaController.logInteraction);
router.get('/logs', authenticateToken, vaController.getLogs);
router.get('/cost', authenticateToken, vaController.getCost);
router.post('/cost/reset', authenticateToken, vaController.resetCost);

module.exports = router;

