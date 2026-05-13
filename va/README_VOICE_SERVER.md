# Voice Assistant — English + Urdu

The Voice Assistant backend uses a **Python voice server** for speech-to-text (Whisper) and text-to-speech (gTTS), supporting **English** and **Urdu**.

## Quick start

1. **Install Python dependencies**
   - From **Patient** folder (`Patient2.0\Patient`):
     ```bash
     pip install -r va/python_servers/requirements_va.txt
     ```
   - From **Patient\backend** folder:
     ```bash
     pip install -r ../va/python_servers/requirements_va.txt
     ```
     **System:** Install FFmpeg (e.g. `winget install FFmpeg` on Windows).

2. **Start the Python voice server** (must run before using VA)
   - From **Patient** folder:
     ```bash
     python va/python_servers/voice_server.py
     ```
   - From **Patient\backend** folder:
     ```bash
     python ../va/python_servers/voice_server.py
     ```
     Server runs on **port 5000** by default. Set `VOICE_SERVER_PORT` to change it.

3. **Configure backend** (optional): In `.env` set:

   ```env
   PYTHON_WHISPER_URL=http://127.0.0.1:5000
   ```

4. Start the Patient backend as usual. VA routes remain at `/api/va/*` (transcribe, synthesize, process-command, etc.).

## API compatibility

- **POST /api/va/transcribe** — Request: `{ audio (base64), format, language, provider }`. Response: `{ text, confidence, language, provider }`.
- **POST /api/va/synthesize** — Request: `{ text, language, voice }`. Response: `{ audio (base64), format, duration }`.
- Other `/api/va` routes (process-command, status, initialize, history) are unchanged.

## Troubleshooting

- **"Voice server is not running"** — Start `voice_server.py` on port 5000.
- **FFmpeg not found** — Install FFmpeg and ensure it is on PATH, or set `FFMPEG_PATH` in the environment before starting the Python server.
- **Whisper model load slow/fail** — First run downloads the model; ensure internet and enough disk space. Use `WHISPER_MODEL=tiny` for a smaller model.
