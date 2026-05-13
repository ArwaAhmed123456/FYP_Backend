# Data Encryption Setup Guide

## Overview

The teleconsultation system uses AES-256-GCM encryption to protect sensitive medical data stored in MongoDB. All encryption/decryption happens automatically through Mongoose model hooks.

## Environment Configuration

Add the following to your `.env` file:

```bash
# Encryption Key for AES-256
# Generate a secure 32-byte key (64 hex characters) or 32-byte string
# Example: openssl rand -hex 32
ENCRYPTION_KEY=your-64-character-hex-encryption-key-here
```

### Generating an Encryption Key

**Option 1: Using OpenSSL (Recommended)**
```bash
openssl rand -hex 32
```

**Option 2: Using Node.js**
```javascript
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));
```

**Option 3: Using Python**
```python
import secrets
print(secrets.token_hex(32))
```

## Encrypted Fields

The following fields are automatically encrypted:

### Patient Medical Records (`Patient Medical Record` collection)
- `diagnosis` - Patient diagnosis
- `notes` - Medical notes
- `symptoms` - Array of symptoms
- `vitals` - Vital signs object
- `allergies` - Array of allergies
- `chronicConditions` - Array of chronic conditions

### Doctor Appointments (`Doctor_appointment` collection)
- `notes` - Appointment notes
- `diagnosis` - Diagnosis (if present)

### Call Records (`Doc_Patient_Call` collection)
- `logs[].details` - Call log details
- `metadata` - Call metadata (including recording metadata)

## How It Works

1. **Automatic Encryption**: When saving documents, sensitive fields are automatically encrypted using Mongoose `pre('save')` hooks.

2. **Automatic Decryption**: When retrieving documents, sensitive fields are automatically decrypted using Mongoose `post(['find', 'findOne', 'findOneAndUpdate'])` hooks.

3. **Backward Compatibility**: The system checks if data is already encrypted (prefixed with `ENC:`) before encrypting, ensuring existing unencrypted data can be migrated gradually.

## Authorization

Only authorized users can access encrypted data:

- **Assigned Doctor**: Can access their own patients' data
- **Assigned Patient**: Can access their own medical records
- **System Admin**: Can access all data

Authorization checks are enforced in:
- `backend/routes/callRoutes.js` - Call data access
- `backend/controller/PatientDetailController.js` - Medical record access
- `backend/services/authorizationService.js` - Authorization logic

## Security Notes

1. **Key Management**: Store the encryption key securely. Never commit it to version control.

2. **Key Rotation**: If you need to rotate keys, you'll need to:
   - Decrypt all existing data with the old key
   - Re-encrypt with the new key
   - Update the `ENCRYPTION_KEY` environment variable

3. **Backup**: Ensure encrypted backups include the encryption key (stored separately and securely).

4. **Stream.io**: Video/audio recordings remain E2E encrypted by Stream.io. Only metadata is encrypted in our database.

## Testing

To verify encryption is working:

1. Check that data in MongoDB is prefixed with `ENC:`
2. Verify that API responses return decrypted data
3. Test authorization by attempting to access data with unauthorized users

## Troubleshooting

**Data appears encrypted in API responses:**
- Check that Mongoose post hooks are running
- Verify the encryption key is correct
- Check for errors in the console

**Encryption not working:**
- Verify `ENCRYPTION_KEY` is set in `.env`
- Check that the key is 64 hex characters or 32 bytes
- Ensure models are using the encryption service correctly

