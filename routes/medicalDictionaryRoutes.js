/**
 * Medical dictionary routes. JWT required.
 * GET    /api/medical-dictionary/:sessionId
 * POST   /api/medical-dictionary/search
 * DELETE /api/medical-dictionary/clear/:sessionId
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authChat');
const medicalDictionaryController = require('../controller/medicalDictionaryController');

router.get('/:sessionId', authenticateToken, medicalDictionaryController.getBySession);
router.post('/search', authenticateToken, medicalDictionaryController.search);
router.delete('/clear/:sessionId', authenticateToken, medicalDictionaryController.clearSession);

module.exports = router;
