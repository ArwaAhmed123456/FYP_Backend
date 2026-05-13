# -*- coding: utf-8 -*-
"""
Tabeeb Chatbot API Server - Port 5001
Flask server exposing /health, /chat, /intent, /greeting endpoints.
Loads pre-trained ML model and data files from backend/data/chatbot/.

Start: python chatbot_api.py
"""

import os
import sys
import json
import logging
import re
import random
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('CHATBOT_PORT', '5001'))

# ============================================================
# DATA DIRECTORY
# ============================================================
BASE_DIR = Path(__file__).parent.parent  # backend/
DATA_DIR = BASE_DIR / 'data' / 'chatbot'

# ============================================================
# LOAD ASSETS AT STARTUP
# ============================================================
model = None
symptoms = []
disease_df = None
df_qa = None
drug_df = None
symptoms_set = set()

def load_assets():
    global model, symptoms, disease_df, df_qa, drug_df, symptoms_set
    try:
        import joblib
        import pandas as pd

        model_path = DATA_DIR / 'disease_predictor.pkl'
        symptoms_path = DATA_DIR / 'symptoms.json'
        disease_path = DATA_DIR / 'disease_symptoms.csv'
        qa_path = DATA_DIR / 'qa_dataset.csv'
        drug_path = DATA_DIR / 'medTrove.Med_Info.csv'

        if model_path.exists():
            model = joblib.load(model_path)
            logger.info("✅ Disease prediction model loaded")
        else:
            logger.warning("⚠️  Model not found: %s", model_path)

        if symptoms_path.exists():
            with open(symptoms_path, 'r', encoding='utf-8') as f:
                symptoms = json.load(f)
            symptoms_set = set(symptoms)
            logger.info("✅ Symptoms list loaded (%d symptoms)", len(symptoms))
        else:
            logger.warning("⚠️  Symptoms file not found: %s", symptoms_path)

        if disease_path.exists():
            disease_df = pd.read_csv(disease_path)
            logger.info("✅ Disease-symptom mapping loaded (%d diseases)", len(disease_df))

        if qa_path.exists():
            df_qa = pd.read_csv(qa_path)
            df_qa['question_lower'] = df_qa['question'].str.lower()
            logger.info("✅ Q&A dataset loaded (%d pairs)", len(df_qa))

        if drug_path.exists():
            drug_df = pd.read_csv(drug_path)
            logger.info("✅ Medicine dataset loaded (%d records)", len(drug_df))

    except Exception as e:
        logger.error("❌ Error loading assets: %s", e)


# ============================================================
# HELPERS
# ============================================================

def extract_symptoms_from_text(text):
    text = text.lower().replace("-", "_")
    detected = []
    for sym in symptoms:
        pattern = r"\b" + re.escape(sym.replace("_", " ")) + r"\b"
        if re.search(pattern, text) or sym.replace("_", " ") in text:
            detected.append(sym)
    return list(set(detected))


def contains_symptoms(text):
    text_lower = text.lower()
    for sym in symptoms_set:
        if sym.replace("_", " ") in text_lower:
            return True
    return False


def predict_disease(user_symptoms):
    if not model or not symptoms:
        return None, 0
    import pandas as pd
    input_vector = [0] * len(symptoms)
    for sym in user_symptoms:
        if sym in symptoms:
            input_vector[symptoms.index(sym)] = 1
    input_df = pd.DataFrame([input_vector], columns=symptoms)
    prediction = model.predict(input_df)[0]
    probs = model.predict_proba(input_df)[0]
    confidence = round(float(max(probs)) * 100, 2)
    return prediction, confidence


def fuzzy_qa_search(query):
    if df_qa is None or df_qa.empty:
        return "I couldn't find an answer to that. Please consult a doctor."
    try:
        from rapidfuzz import process
        choices = df_qa['question_lower'].tolist()
        matches = process.extract(query.lower(), choices, limit=1)
        if matches and matches[0][1] > 60:
            idx = matches[0][2]
            return str(df_qa.iloc[idx]['answer'])
    except Exception:
        pass
    return "I'm not fully sure. Please consult a healthcare professional."


# ============================================================
# INTENT CLASSIFICATION (for Voice Assistant)
# ============================================================

# Navigation keywords map: keyword -> screen name
NAV_KEYWORDS = {
    # English
    "home": "EnhancedDashboard",
    "dashboard": "EnhancedDashboard",
    "doctor": "Consultations",
    "consultation": "Consultations",
    "consult": "Consultations",
    "specialist": "Consultations",
    "appointment": "AppointmentBooking",
    "book": "AppointmentBooking",
    "schedule": "AppointmentBooking",
    "checkup": "AppointmentBooking",
    "prescription": "Prescriptions",
    "medicine": "Prescriptions",
    "medication": "Prescriptions",
    "drugs": "Prescriptions",
    "record": "HealthRecordNavigator",
    "report": "HealthRecordNavigator",
    "lab": "HealthRecordNavigator",
    "blood test": "HealthRecordNavigator",
    "hospital": "Finder2",
    "emergency": "Finder2",
    "pharmacy": "Finder3",
    "chemist": "Finder3",
    "drugstore": "Finder3",
    "profile": "Profile",
    "account": "Profile",
    "payment": "PaymentMethods",
    "card": "PaymentMethods",
    "transaction": "TransactionHistory",
    "billing": "TransactionHistory",
    "notification": "Notifications",
    "alert": "Notifications",
    "settings": "Settings",
    "language": "Settings",
    "articles": "Articles",
    "blog": "Articles",
    "news": "Articles",
    "chatbot": "ChatbotSession",
    "ai doctor": "ChatbotSession",
    # Urdu / Roman Urdu
    "ghar": "EnhancedDashboard",
    "mukhya": "EnhancedDashboard",
    "mushwara": "Consultations",
    "mashwara": "Consultations",
    "hakeem": "Consultations",
    "mulaqat": "AppointmentBooking",
    "waqt": "AppointmentBooking",
    "nuskha": "Prescriptions",
    "dawai": "Prescriptions",
    "dawa": "Prescriptions",
    "sehat record": "HealthRecordNavigator",
    "aspataal": "Finder2",
    "dawai ki dukan": "Finder3",
    "dawa ki dukan": "Finder3",
    "mera account": "Profile",
    "shanakht": "Profile",
    "adaigi": "PaymentMethods",
    "len den": "TransactionHistory",
    "ittilaat": "Notifications",
    "tarteebaat": "Settings",
    "zuban": "Settings",
    "balagh": "Articles",
    "aey aye doctor": "ChatbotSession",
    "ai se baat": "ChatbotSession",
    "back": "BACK",
    "wapis": "BACK",
    "pichhe": "BACK",
}


def classify_intent(transcript, context=None):
    """
    Classify voice transcript into navigation/chat/form_fill/unknown.
    Returns dict matching the format the VA frontend expects.
    """
    text = transcript.strip().lower()

    # --- Navigation detection ---
    # Check multi-word first, then single
    sorted_keywords = sorted(NAV_KEYWORDS.keys(), key=len, reverse=True)
    for kw in sorted_keywords:
        if kw in text:
            screen = NAV_KEYWORDS[kw]
            confidence = 0.85 if len(kw) > 5 else 0.75
            return {
                "type": "navigation",
                "screen": screen,
                "params": {},
                "confidence": confidence,
                "reason": f"Keyword match: '{kw}'"
            }

    # --- Form fill detection ---
    form_indicators = [
        "my email", "my name is", "my password", "login with",
        "mera naam", "email hai", "password hai", "sign up", "register"
    ]
    extracted = {}
    for ind in form_indicators:
        if ind in text:
            # Try to extract email
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', transcript)
            if email_match:
                extracted["email"] = email_match.group(0)
            # Try to extract phone
            phone_match = re.search(r'0\d{10}', transcript)
            if phone_match:
                extracted["contact"] = phone_match.group(0)
            return {
                "type": "form_fill",
                "screen": None,
                "params": {"extracted_data": extracted},
                "confidence": 0.80,
                "reason": f"Form fill indicator: '{ind}'"
            }

    # --- Chat/health question detection ---
    chat_indicators = [
        "what", "why", "how", "when", "does", "can", "should", "is",
        "i have", "i feel", "i am", "my", "mujhe", "mera", "meri",
        "kya", "kyun", "kaise", "dard", "bukhar", "sehat", "bimari",
        "symptom", "pain", "fever", "sick", "ill", "health", "treat"
    ]
    for ind in chat_indicators:
        if ind in text:
            return {
                "type": "chat",
                "screen": None,
                "params": {},
                "confidence": 0.70,
                "reason": f"Chat indicator: '{ind}'"
            }

    return {
        "type": "unknown",
        "screen": None,
        "params": {},
        "confidence": 0.0,
        "reason": "No matching intent found"
    }


# ============================================================
# ROUTES
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "symptoms_loaded": len(symptoms) > 0,
        "qa_loaded": df_qa is not None and not df_qa.empty,
        "drug_db_loaded": drug_df is not None and not drug_df.empty,
        "port": PORT
    }), 200


@app.route('/greeting', methods=['GET'])
def greeting():
    greetings = [
        "Hello there! 👋 I'm your Tabeeb Health Assistant.",
        "Hi! 😊 I'm here to help you with your health questions.",
        "Hey! Let's find out what might be causing your discomfort."
    ]
    return jsonify({"greeting": random.choice(greetings)}), 200


@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    language = data.get('language', 'en')

    if not message:
        return jsonify({"error": "Message is required"}), 400

    # Strip Urdu prefix if added by Node chatService
    urdu_prefix = "Please respond in Urdu language.\n\n"
    if message.startswith(urdu_prefix):
        message = message[len(urdu_prefix):]

    try:
        response_text = ""

        # 1) Symptom-based disease prediction
        if symptoms and contains_symptoms(message):
            detected = extract_symptoms_from_text(message)
            if detected and model:
                disease, confidence = predict_disease(detected)
                if disease:
                    response_text = (
                        f"Based on your symptoms, you may have **{disease}** "
                        f"(confidence: {confidence}%). "
                        "Please consult a doctor for a proper diagnosis."
                    )

        # 2) Fallback to Q&A
        if not response_text:
            response_text = fuzzy_qa_search(message)

        if language == 'ur':
            # Prepend a note - actual translation would need a service
            response_text = response_text

        return jsonify({
            "response": response_text,
            "sources": [],
            "language": language
        }), 200

    except Exception as e:
        logger.exception("Chat error")
        return jsonify({"error": str(e), "response": "Sorry, an error occurred. Please try again."}), 500


@app.route('/intent', methods=['POST'])
def intent():
    """
    Voice assistant intent classification endpoint.
    Used by the VA's intentService.js instead of OpenAI.
    """
    data = request.get_json() or {}
    transcript = (data.get('transcript') or '').strip()
    context = data.get('context', {})

    if not transcript:
        return jsonify({
            "type": "unknown",
            "confidence": 0.0,
            "error": "Transcript is required"
        }), 400

    try:
        result = classify_intent(transcript, context)
        logger.info("[Intent] '%s' -> %s (%.2f)", transcript, result['type'], result['confidence'])
        return jsonify(result), 200
    except Exception as e:
        logger.exception("Intent classification error")
        return jsonify({
            "type": "unknown",
            "confidence": 0.0,
            "error": str(e)
        }), 500


# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    logger.info("Loading chatbot assets...")
    load_assets()
    logger.info("🚀 Tabeeb Chatbot API starting on port %d", PORT)
    app.run(host='0.0.0.0', port=PORT, debug=False)
