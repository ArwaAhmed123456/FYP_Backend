const express = require('express');
const router = express.Router();
const {
  createMedicalRecord,
  getMedicalRecordsByUser,
  getUploadParams,
  simplifyRecord,
} = require('../controller/medicalRecordController');
const authService = require('../services/auth');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }
  try {
    req.user = authService.verifyToken(token);
    next();
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
}

router.post('/medical-record', authenticateToken, createMedicalRecord);
router.get('/medical-records/:userId', authenticateToken, getMedicalRecordsByUser);
router.get('/medical-record/upload-params', authenticateToken, getUploadParams);
router.post('/medical-record/:id/simplify', authenticateToken, simplifyRecord);

module.exports = router;
