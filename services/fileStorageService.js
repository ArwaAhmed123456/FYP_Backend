/**
 * File Storage Service
 * Handles file uploads to local storage or cloud storage (S3)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac'],
  document: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Get file type category from MIME type
 */
function getFileTypeCategory(mimetype) {
  if (ALLOWED_FILE_TYPES.image.includes(mimetype)) return 'image';
  if (ALLOWED_FILE_TYPES.pdf.includes(mimetype)) return 'pdf';
  if (ALLOWED_FILE_TYPES.audio.includes(mimetype)) return 'audio';
  if (ALLOWED_FILE_TYPES.document.includes(mimetype)) return 'document';
  return 'other';
}

/**
 * Validate file
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
  }

  const allowedTypes = [
    ...ALLOWED_FILE_TYPES.image,
    ...ALLOWED_FILE_TYPES.pdf,
    ...ALLOWED_FILE_TYPES.audio,
    ...ALLOWED_FILE_TYPES.document
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }

  return { valid: true };
}

/**
 * Generate unique filename
 */
function generateFilename(originalname, mimetype) {
  const ext = path.extname(originalname);
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}_${uniqueId}${ext}`;
}

/**
 * Save file to local storage
 */
async function saveFileLocal(file, callId) {
  try {
    // Create call-specific directory
    const callDir = path.join(UPLOAD_DIR, callId);
    if (!fs.existsSync(callDir)) {
      fs.mkdirSync(callDir, { recursive: true });
    }

    // Generate filename
    const filename = generateFilename(file.originalname, file.mimetype);
    const filepath = path.join(callDir, filename);

    // Save file
    await fs.promises.writeFile(filepath, file.buffer);

    // Return file info
    return {
      filename,
      filepath,
      url: `/api/call/files/${callId}/${filename}`,
      size: file.size,
      mimetype: file.mimetype,
      originalname: file.originalname
    };
  } catch (error) {
    console.error('Error saving file locally:', error);
    throw new Error('Failed to save file');
  }
}

/**
 * Delete file from local storage
 */
async function deleteFileLocal(callId, filename) {
  try {
    const filepath = path.join(UPLOAD_DIR, callId, filename);
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get file from local storage
 */
function getFileLocal(callId, filename) {
  const filepath = path.join(UPLOAD_DIR, callId, filename);
  if (fs.existsSync(filepath)) {
    return filepath;
  }
  return null;
}

/**
 * Save file (wrapper for future S3 support)
 */
async function saveFile(file, callId) {
  // For now, use local storage
  // TODO: Add S3 support when needed
  return await saveFileLocal(file, callId);
}

/**
 * Delete file (wrapper for future S3 support)
 */
async function deleteFile(callId, filename) {
  // For now, use local storage
  // TODO: Add S3 support when needed
  return await deleteFileLocal(callId, filename);
}

/**
 * Get file (wrapper for future S3 support)
 */
function getFile(callId, filename) {
  // For now, use local storage
  // TODO: Add S3 support when needed
  return getFileLocal(callId, filename);
}

module.exports = {
  validateFile,
  getFileTypeCategory,
  saveFile,
  deleteFile,
  getFile,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES
};

