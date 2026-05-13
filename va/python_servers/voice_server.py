"""
Voice Assistant Python Server: Whisper (STT) + gTTS (TTS)
English + Urdu support. Single process on port 5000 by default.
Start: python voice_server.py
Env: VOICE_SERVER_PORT=5000 (optional)
"""

import os
import io
import logging
import subprocess
import uuid
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('VOICE_SERVER_PORT', '5000'))


def check_ffmpeg():
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return "ffmpeg"
    except FileNotFoundError:
        pass
    # Allow override via environment variable (useful for Windows where ffmpeg isn't on PATH)
    env_path = os.environ.get("FFMPEG_PATH", "")
    if env_path and os.path.exists(env_path):
        try:
            subprocess.run([env_path, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return env_path
        except Exception:
            pass
    # Common WinGet install location (fallback for development on Windows)
    winget_glob = r"C:\Users\*\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg*\**\ffmpeg.exe"
    try:
        import glob
        matches = glob.glob(winget_glob, recursive=True)
        if matches:
            return matches[0]
    except Exception:
        pass
    return None


# Load Whisper once at startup
ffmpeg_path = check_ffmpeg()
if not ffmpeg_path:
    logger.warning("FFmpeg not found. Transcription will fail until FFmpeg is installed (e.g. winget install FFmpeg).")
else:
    if ffmpeg_path != "ffmpeg":
        bin_dir = os.path.dirname(ffmpeg_path)
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
    logger.info("FFmpeg found: %s", ffmpeg_path)

try:
    import whisper
    _whisper_model = whisper.load_model(os.environ.get("WHISPER_MODEL", "base"))
    logger.info("Whisper model loaded.")
except Exception as e:
    _whisper_model = None
    logger.warning("Whisper not loaded: %s. Transcription will fail.", e)


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "model": "base",
        "ffmpeg": check_ffmpeg() is not None,
        "whisper_loaded": _whisper_model is not None,
    }), 200


@app.route("/tts", methods=["POST"])
def text_to_speech():
    """TTS using gTTS. Request: { "text": "...", "language": "en" | "ur" }. Response: audio/mpeg."""
    try:
        data = request.get_json() or {}
        text = data.get("text", "").strip()
        language = data.get("language", "en")

        if not text:
            return jsonify({"error": "Text is required"}), 400

        if language not in ("en", "ur", "ur-PK"):
            language = "en"
        lang_code = "ur" if language in ("ur", "ur-PK") else "en"

        from gtts import gTTS
        tts = gTTS(text=text, lang=lang_code, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return send_file(buf, mimetype="audio/mpeg", as_attachment=False)
    except Exception as e:
        logger.exception("TTS error")
        return jsonify({"error": str(e)}), 500


@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    """STT using Whisper. Form: audio=file, language= en|ur|bilingual. Response: { "text": "..." }."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    language = request.form.get("language", "en")
    rid = str(uuid.uuid4())
    ext = Path(audio_file.filename or "").suffix or ".m4a"
    temp_path = f"temp_audio_{rid}{ext}"
    wav_path = f"temp_processed_{rid}.wav"

    try:
        audio_file.save(temp_path)
    except Exception as e:
        return jsonify({"error": f"Save failed: {e}"}), 500

    try:
        current_ffmpeg = check_ffmpeg()
        if not current_ffmpeg:
            return jsonify({"error": "FFmpeg not installed"}), 503
        if not _whisper_model:
            return jsonify({"error": "Whisper model not loaded"}), 503

        subprocess.run(
            [current_ffmpeg, "-y", "-i", temp_path, "-ar", "16000", "-ac", "1", wav_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        if os.path.getsize(wav_path) < 3000:
            return jsonify({"text": ""})

        model_language = language
        initial_prompt = "English: Health records, doctor appointments, medication, Tabeeb app assistant."
        if language == "bilingual":
            model_language = None
            initial_prompt = "English and Urdu: Tabeeb app, health assistant transcription (Bilingual)."
        elif language in ("ur", "ur-PK"):
            model_language = "ur"
            initial_prompt = "طبیب ایپ، مدد، نسخہ، لیب رپورٹ۔ یہ ایک طبی اسسٹنٹ ہے۔"

        try:
            result = _whisper_model.transcribe(
                wav_path,
                language=model_language,
                initial_prompt=initial_prompt,
                fp16=False,
            )
            text = (result.get("text") or "").strip()
        except ValueError as ve:
            logger.warning("Whisper transcription ValueError (possibly nan logits): %s", ve)
            text = ""
        
        return jsonify({"text": text})
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b"").decode()
        logger.error("FFmpeg error: %s", err)
        return jsonify({"error": "Audio conversion failed", "details": err}), 500
    except Exception as e:
        logger.exception("Transcription error")
        return jsonify({"error": str(e)}), 500
    finally:
        for p in (temp_path, wav_path):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


if __name__ == "__main__":
    logger.info("Starting Voice Server on port %s", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
