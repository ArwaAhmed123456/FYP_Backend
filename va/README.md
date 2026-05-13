# Voice Assistant (VA) Integration

This folder contains the voice assistant integration for the Patient module.

## Structure

- `backend/` - Backend routes, controllers, and services for voice assistant
- `frontend/` - Frontend components and services for voice assistant UI
- `tests/` - Test files for voice assistant functionality

## Integration Notes

- Voice assistant is initialized when a patient logs in or accesses their dashboard
- Voice commands are handled through API endpoints at `/api/va/*`
- The voice assistant can be disabled/enabled through user settings
- All original functionality is preserved and modular

## Files Moved from `/va`

- `backup/firebaseConfig copy.js` - Firebase configuration (updated paths)
- `backup/_.env` - Environment variables template
