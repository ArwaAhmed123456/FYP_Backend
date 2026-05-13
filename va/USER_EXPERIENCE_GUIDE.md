# Voice Assistant User Experience Guide

## User Flow

### 1. Initial Setup (Language Selection Screen)
When a user selects "Patient" from the home page and reaches the Language Selection screen:

1. **User selects language** (English or Urdu)
2. **User clicks "Continue"**
3. **Voice Assistant Modal appears** with:
   - Welcome message spoken automatically
   - "Voice assistant is on" message
   - Features listed (Voice Commands, Voice Responses, Smart Assistance)
   - Two options:
     - **"Disable"** - Turns off voice assistant
     - **"Keep Enabled"** - Keeps voice assistant on
4. **After confirmation**, user proceeds to Login screen

### 2. Dashboard Experience
Once logged in, the voice assistant appears on the dashboard:

- **Compact widget** showing:
  - Robot icon
  - "Voice Assistant" label
  - Microphone button
- **Tap microphone** to:
  - Start recording (button turns red, timer shows)
  - Speak your command
  - Tap again to stop and process
- **Response is spoken automatically** (if enabled)

### 3. Voice Commands Examples

**English:**
- "Find a doctor near me"
- "Book an appointment"
- "Show my prescriptions"
- "Give me a health tip"

**Urdu:**
- "میرے قریب ڈاکٹر تلاش کریں"
- "اپائنٹمنٹ بک کریں"
- "میری دوائیں دکھائیں"

## Features

### ✅ Automatic Speech
- Responses are spoken automatically when received
- Works in both English and Urdu
- Can be stopped or replayed

### ✅ Voice Recording
- Tap microphone to record
- Visual feedback (red button, timer)
- Automatic transcription
- Automatic command processing

### ✅ Smart Navigation
- Automatically navigates based on command intent:
  - Doctor search → Doctor List
  - Appointment → Appointment Booking
  - Prescription → Prescriptions screen

## Settings

Users can:
- Enable/disable voice assistant in Settings
- Change language preference
- View command history
- Clear command history

## Troubleshooting

### Not Hearing Sound?
1. Check device volume
2. Verify voice assistant is enabled in settings
3. Check if "Keep Enabled" was selected during setup

### Not Seeing Voice Assistant?
1. Make sure you're logged in
2. Check dashboard screen
3. Verify voice assistant was enabled during language selection

### Recording Not Working?
1. Grant microphone permissions when prompted
2. Check device microphone settings
3. Ensure voice assistant is enabled

## Technical Notes

- Voice assistant initializes on language selection (first time only)
- Modal appears once per user (stored in AsyncStorage)
- Text-to-speech uses device's built-in TTS
- Speech-to-text ready for cloud service integration

