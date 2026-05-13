# SMS Setup Instructions

## Twilio SMS Configuration

To enable real SMS functionality for OTP verification, you need to configure Twilio credentials.

### 1. Get Twilio Credentials

1. Sign up for a Twilio account at https://www.twilio.com/
2. Get your Account SID and Auth Token from the Twilio Console
3. Purchase a Pakistani phone number or use the provided sender number: `03305197633`

### 2. Environment Variables

Add these environment variables to your `.env` file:

```env
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# SMS Sender Number (Pakistani number)
SMS_SENDER_NUMBER=03305197633
```

### 3. Phone Number Formatting

The SMS service automatically handles Pakistani phone number formatting:

- **Input**: `03458485328` (local format)
- **Converted to**: `+923458485328` (international format for Twilio)
- **Sent from**: `03305197633` (Pakistani sender number)

### 4. Supported Phone Formats

- ✅ `03458485328` (Pakistani local format)
- ✅ `+923458485328` (International format)
- ✅ `923458485328` (International without +)

### 5. Fallback Behavior

If Twilio credentials are not configured:

- SMS will still show as "sent" in the UI
- OTP will be logged to console for testing
- No actual SMS will be sent

### 6. SMS Message Format

```
Your Tabeeb verification code is: 123456. This code will expire in 10 minutes.
```

### 7. Testing

1. Configure Twilio credentials
2. Test with a Pakistani phone number
3. Check Twilio Console for delivery status
4. Monitor server logs for SMS sending status

### 8. Troubleshooting

- **SMS not received**: Check Twilio Console for delivery status
- **Invalid phone number**: Ensure phone number is in correct Pakistani format
- **Twilio errors**: Verify Account SID and Auth Token are correct
- **Sender ID issues**: Ensure sender number is registered with Twilio
