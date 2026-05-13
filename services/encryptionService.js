/**
 * AES-256 Encryption Service
 * Provides encryption/decryption for sensitive medical data
 */

const crypto = require('crypto');

// Encryption key - should be stored in environment variable
// In production, use a secure key management system
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for IV
const SALT_LENGTH = 64; // 64 bytes for salt
const TAG_LENGTH = 16; // 16 bytes for GCM tag
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_PREFIX = 'ENC:';

// Ensure we have a valid 32-byte key
let encryptionKey;
if (ENCRYPTION_KEY.length === 64) {
  // Hex string, convert to buffer
  encryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
} else if (ENCRYPTION_KEY.length === 32) {
  // Already a 32-byte string
  encryptionKey = Buffer.from(ENCRYPTION_KEY);
} else {
  // Generate a key from the string using PBKDF2
  encryptionKey = crypto.pbkdf2Sync(ENCRYPTION_KEY, 'tabeeb-salt', 100000, 32, 'sha256');
}

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string with prefix
 */
function encrypt(text) {
  if (!text || text === null || text === undefined) {
    return text;
  }

  // If already encrypted, return as is
  if (typeof text === 'string' && text.startsWith(ENCRYPTED_PREFIX)) {
    return text;
  }

  try {
    // Convert to string if not already
    const textString = String(text);
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    
    // Encrypt
    let encrypted = cipher.update(textString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const tag = cipher.getAuthTag();
    
    // Combine: salt + iv + tag + encrypted
    const combined = iv.toString('hex') + tag.toString('hex') + encrypted;
    
    return ENCRYPTED_PREFIX + combined;
  } catch (error) {
    console.error('Encryption error:', error);
    // Return original text if encryption fails (should not happen in production)
    return text;
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted string with prefix
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText || encryptedText === null || encryptedText === undefined) {
    return encryptedText;
  }

  // If not encrypted, return as is
  if (typeof encryptedText !== 'string' || !encryptedText.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedText;
  }

  try {
    // Remove prefix
    const combined = encryptedText.substring(ENCRYPTED_PREFIX.length);
    
    // Extract components
    const iv = Buffer.from(combined.substring(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(combined.substring(IV_LENGTH * 2, IV_LENGTH * 2 + TAG_LENGTH * 2), 'hex');
    const encrypted = combined.substring(IV_LENGTH * 2 + TAG_LENGTH * 2);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // Return original if decryption fails (might be corrupted data)
    return encryptedText;
  }
}

/**
 * Encrypt an array of strings
 * @param {Array<string>} array - Array of strings to encrypt
 * @returns {Array<string>} - Array of encrypted strings
 */
function encryptArray(array) {
  if (!Array.isArray(array)) {
    return array;
  }
  return array.map(item => {
    if (typeof item === 'string') {
      return encrypt(item);
    }
    return item;
  });
}

/**
 * Decrypt an array of encrypted strings
 * @param {Array<string>} array - Array of encrypted strings
 * @returns {Array<string>} - Array of decrypted strings
 */
function decryptArray(array) {
  if (!Array.isArray(array)) {
    return array;
  }
  return array.map(item => {
    if (typeof item === 'string') {
      return decrypt(item);
    }
    return item;
  });
}

/**
 * Encrypt an object (for Mixed types like vitals, metadata)
 * @param {Object} obj - Object to encrypt
 * @returns {string} - Encrypted JSON string
 */
function encryptObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  try {
    const jsonString = JSON.stringify(obj);
    return encrypt(jsonString);
  } catch (error) {
    console.error('Object encryption error:', error);
    return obj;
  }
}

/**
 * Decrypt an encrypted object
 * @param {string} encryptedString - Encrypted JSON string
 * @returns {Object} - Decrypted object
 */
function decryptObject(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    return encryptedString;
  }
  
  try {
    const decrypted = decrypt(encryptedString);
    return JSON.parse(decrypted);
  } catch (error) {
    // If decryption fails or JSON parse fails, return original
    console.error('Object decryption error:', error);
    return encryptedString;
  }
}

/**
 * Check if a value is encrypted
 * @param {any} value - Value to check
 * @returns {boolean} - True if encrypted
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

module.exports = {
  encrypt,
  decrypt,
  encryptArray,
  decryptArray,
  encryptObject,
  decryptObject,
  isEncrypted,
  ENCRYPTED_PREFIX
};

