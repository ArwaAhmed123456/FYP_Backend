/**
 * OCR health records: create and list. Does not modify Patient Medical Record schema.
 * Stores in HealthRecordOCR; optionally creates a Patient Medical Record from parsed data.
 */
const HealthRecordOcr = require('../models/HealthRecordOcrModel');
const { parseMedicalText } = require('../utils/parseMedicalText');
const { analyzeAndSimplify } = require('../services/diagnosisSimplifierService');
const mongoose = require('mongoose');

/**
 * POST /api/medical-record
 * Body: { userId, imageUrl?, imageBase64?, ocrText, sourceFileName?, parsed? }
 * Provide imageUrl (HTTPS, e.g. Cloudinary) OR imageBase64 (data URI fallback).
 */
const createMedicalRecord = async (req, res) => {
  try {
    const { userId, imageUrl, imageBase64, ocrText, parsed: parsedBody, sourceFileName, language } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    // Accept an HTTPS URL (Cloudinary) OR a base64 data URI as the image store.
    const hasUrl = typeof imageUrl === 'string' && imageUrl.trim().length > 0;
    const hasBase64 = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;

    if (!hasUrl && !hasBase64) {
      return res.status(400).json({ success: false, message: 'imageUrl (HTTPS) or imageBase64 is required' });
    }
    if (hasUrl && !imageUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'imageUrl must be HTTPS' });
    }

    const imageStore = hasUrl ? imageUrl.trim() : imageBase64.trim();
    const ocrTextStr = typeof ocrText === 'string' ? ocrText : '';
    const parsed = parsedBody && typeof parsedBody === 'object'
      ? {
          diagnoses: Array.isArray(parsedBody.diagnoses) ? parsedBody.diagnoses : [],
          prescriptions: Array.isArray(parsedBody.prescriptions) ? parsedBody.prescriptions : [],
          allergies: Array.isArray(parsedBody.allergies) ? parsedBody.allergies : [],
        }
      : parseMedicalText(ocrTextStr);

    const lang = language === 'urdu' ? 'urdu' : 'english';

    const doc = new HealthRecordOcr({
      userId,
      imageUrl: imageStore,
      ocrText: ocrTextStr.trim(),
      sourceFileName: typeof sourceFileName === 'string' ? sourceFileName.trim() : '',
      language: lang,
      parsed,
    });
    await doc.save();

    const record = doc.toObject();
    return res.status(201).json({
      success: true,
      message: 'Medical record saved',
      record: {
        id: record._id,
        userId: record.userId,
        imageUrl: record.imageUrl,
        ocrText: record.ocrText,
        sourceFileName: record.sourceFileName,
        status: record.status,
        language: record.language,
        parsed: record.parsed,
        createdAt: record.createdAt,
      },
    });
  } catch (err) {
    console.error('createMedicalRecord error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to save medical record',
    });
  }
};

/**
 * GET /api/medical-records/:userId
 * List OCR-backed records for the patient (newest first).
 */
const getMedicalRecordsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const requestingUserId = req.user?.userId || req.user?.id || req.user?._id;
    if (!requestingUserId || String(requestingUserId) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'You can only access your own records' });
    }

    const list = await HealthRecordOcr.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      records: list.map((r) => ({
        id: r._id,
        userId: r.userId,
        imageUrl: r.imageUrl,
        ocrText: r.ocrText,
        sourceFileName: r.sourceFileName,
        status: r.status,
        language: r.language,
        readabilityScore: r.readabilityScore,
        simplifiedText: r.simplifiedText,
        wasSimplified: r.wasSimplified,
        parsed: r.parsed,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('getMedicalRecordsByUser error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch medical records',
    });
  }
};

/**
 * GET /api/medical-record/upload-params
 * Returns Cloudinary upload params for signed upload (if configured).
 * Frontend uploads to Cloudinary then sends imageUrl to POST /api/medical-record.
 */
const getUploadParams = async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.json({
        success: true,
        configured: false,
        message: 'Cloudinary not configured; send imageUrl from client upload',
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const crypto = require('crypto');
    const params = {
      timestamp,
      folder: 'health-records',
    };
    const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const signature = crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');

    return res.json({
      success: true,
      configured: true,
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: params.folder,
    });
  } catch (err) {
    console.error('getUploadParams error:', err);
    return res.status(500).json({ success: false, message: 'Failed to get upload params' });
  }
};

/**
 * POST /api/medical-record/:id/simplify
 * On-demand simplification. Requires JWT auth. Only the owning user may call this.
 */
const simplifyRecord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' });
    }

    const doc = await HealthRecordOcr.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    // Ownership check — userId on the doc must match the JWT subject.
    const requestingUserId = req.user?.userId || req.user?.id || req.user?._id;
    if (!requestingUserId || String(doc.userId) !== String(requestingUserId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Already simplified — return cached result immediately.
    if (doc.wasSimplified) {
      return res.json({
        success: true,
        wasSimplified: true,
        simplifiedText: doc.simplifiedText,
        readabilityScore: doc.readabilityScore,
      });
    }

    if (!doc.ocrText || !doc.ocrText.trim()) {
      return res.status(400).json({ success: false, message: 'No text to simplify' });
    }

    const { readabilityScore, simplifiedText, wasSimplified } = await analyzeAndSimplify(
      doc.ocrText,
      doc.language || 'english'
    );

    // Text was already simple enough — do NOT update the document.
    if (!wasSimplified) {
      return res.json({
        success: true,
        wasSimplified: false,
        message: 'Text is already simple enough to understand',
      });
    }

    // Simplified successfully — persist and return.
    await HealthRecordOcr.findByIdAndUpdate(id, { readabilityScore, simplifiedText, wasSimplified });

    return res.json({
      success: true,
      wasSimplified: true,
      simplifiedText,
      readabilityScore,
    });
  } catch (err) {
    console.error('simplifyRecord error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Simplification failed' });
  }
};

module.exports = {
  createMedicalRecord,
  getMedicalRecordsByUser,
  getUploadParams,
  simplifyRecord,
};
