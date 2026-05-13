# Prescription Audit Log Integration

This document describes the integration of prescription audit logging with the admin panel.

## Overview

All prescription operations (CREATE, UPDATE, DELETE, SIGN) are now automatically logged to the admin panel's Prescription Audit Log system. This provides a complete audit trail of all prescription changes.

## Environment Variables

Add the following environment variables to your `Patient/backend/.env` file:

```env
# Admin Panel URL (where the audit logs are sent)
ADMIN_PANEL_URL=http://localhost:5000

# Service key for authenticating audit log requests
# This should match the PRESCRIPTION_AUDIT_SERVICE_KEY in the admin panel's .env
PRESCRIPTION_AUDIT_SERVICE_KEY=your-secret-service-key-here
```

**Important:** The `PRESCRIPTION_AUDIT_SERVICE_KEY` must match the value set in the admin panel's `.env` file.

## What Gets Logged

The following prescription events are automatically logged:

1. **CREATE** - When a new prescription is created
2. **UPDATE** - When a prescription is updated (creates new version)
3. **DELETE** - When a prescription is soft-deleted
4. **SIGN** - When a prescription is signed by a doctor (via OTP or legacy method)

## Implementation Details

### Files Modified

1. **`utils/prescriptionAuditLogger.js`** (NEW)

   - Utility function to log prescription audit events
   - Handles sanitization of prescription data
   - Uses axios for HTTP requests
   - Gracefully handles errors (won't break main flow)

2. **`controller/prescriptionController.js`** (MODIFIED)
   - Added audit logging calls after:
     - `createPrescription()` - Logs CREATE event
     - `updatePrescription()` - Logs UPDATE event with before/after states
     - `deletePrescription()` - Logs DELETE event
     - `verifyPrescriptionOTP()` - Logs SIGN event
     - `signPrescription()` - Logs SIGN event (legacy method)

### How It Works

1. When a prescription operation occurs, the controller captures the before/after state
2. The `logPrescriptionAudit()` function is called with the event details
3. The function sanitizes the prescription data (removes sensitive fields)
4. An HTTP POST request is sent to the admin panel's audit log endpoint
5. The admin panel stores the audit log entry in the `PrescriptionAuditLog` collection

### Error Handling

- Audit logging failures **will not** break the main prescription operations
- Errors are logged to the console but do not affect the API response
- If the admin panel is unavailable, a warning is logged but the operation continues

### Data Sanitization

The audit logger automatically:

- Removes internal MongoDB fields (`__v`)
- Converts ObjectIds to strings for JSON serialization
- Handles both Mongoose documents and plain objects

## Testing

To test the integration:

1. Ensure both backends are running
2. Set the environment variables in both `.env` files
3. Create/update/delete/sign a prescription
4. Check the admin panel's Prescription Log page to see the audit entries

## Troubleshooting

### Audit logs not appearing

1. Check that `ADMIN_PANEL_URL` is correct and the admin panel is running
2. Verify `PRESCRIPTION_AUDIT_SERVICE_KEY` matches in both backends
3. Check the console logs for error messages
4. Ensure the admin panel's `/api/admin/prescription-log/log` endpoint is accessible

### Timeout errors

- The audit logger has a 5-second timeout
- If timeouts occur frequently, check network connectivity between backends
- Consider increasing the timeout in `prescriptionAuditLogger.js` if needed

## Security Notes

- The service key should be a strong, randomly generated string
- Never commit the service key to version control
- Use different service keys for development and production environments
- The audit log endpoint validates the service key before accepting logs
