"""
Sentiment Analysis Service
Integrates ML models from fyp_sentiment_analysis project
"""
import os
import sys
import json
import pickle
import re
import contractions
from pathlib import Path

# Add fyp_sentiment_analysis to path
# Script lives at: Patient2.0/Patient/backend/services/sentimentAnalysisService.py
# Models live at:  fyp2026_from_Z_A/fyp_sentiment_analysis/
# So we need to go 5 levels up (services → backend → Patient → Patient2.0 → fyp2026_from_Z_A)
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sentiment_project_path = project_root / 'fyp_sentiment_analysis'
sys.path.insert(0, str(sentiment_project_path))

try:
    import numpy as np
    import pandas as pd
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.svm import LinearSVC
    import joblib
    import tensorflow as tf
    from tensorflow import keras
    import nltk
    from nltk.corpus import stopwords
    from nltk.stem import WordNetLemmatizer
    
    # Download NLTK data if not present
    try:
        nltk.data.find('tokenizers/punkt')
    except (LookupError, Exception):
        try:
            nltk.download('punkt', quiet=True)
        except Exception:
            pass  # Continue without punkt if download fails
    
    try:
        nltk.data.find('corpora/stopwords')
    except (LookupError, Exception):
        try:
            nltk.download('stopwords', quiet=True)
        except Exception:
            pass  # Continue without stopwords if download fails
    
    try:
        nltk.data.find('corpora/wordnet')
    except (LookupError, Exception):
        try:
            nltk.download('wordnet', quiet=True)
            nltk.download('omw-1.4', quiet=True)
        except Exception:
            pass  # Continue without wordnet if download fails
except ImportError as e:
    print(f"Error importing required libraries: {e}", file=sys.stderr)
    sys.exit(1)

# Global variables for models
ml_model = None
vectorizer = None
dl_model = None
dl_tokenizer = None
use_dl = False  # Set to True to use DL model, False for ML model

def preprocess_text(text):
    """Preprocess text for sentiment analysis"""
    if not text or not isinstance(text, str):
        return ""
    
    # Convert to lowercase
    text = text.lower()
    
    # Fix contractions
    try:
        text = contractions.fix(text)
    except:
        pass
    
    # Remove URLs
    text = re.sub(r'http\S+|www\S+', '', text)
    
    # Remove emails
    text = re.sub(r'\S+@\S+', '', text)
    
    # Keep only alphanumeric and basic punctuation
    text = re.sub(r'[^a-zA-Z0-9\s!?.,]', '', text)
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def load_ml_models():
    """Load ML models and vectorizer"""
    global ml_model, vectorizer
    
    try:
        # Try to load models from fyp_sentiment_analysis directory
        model_path = sentiment_project_path / 'logistic_model.pkl'
        vectorizer_path = sentiment_project_path / 'tfidf_vectorizer.pkl'
        
        if model_path.exists() and vectorizer_path.exists():
            ml_model = joblib.load(model_path)
            vectorizer = joblib.load(vectorizer_path)
            print("✅ ML models loaded successfully", file=sys.stderr)
            return True
        else:
            print(f"⚠️ Model files not found at {model_path} or {vectorizer_path}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"❌ Error loading ML models: {e}", file=sys.stderr)
        return False

def load_dl_models():
    """Load DL models and tokenizer"""
    global dl_model, dl_tokenizer
    
    try:
        # Try to load DL model
        model_path = sentiment_project_path / 'my_lstm_model.keras'
        tokenizer_path = sentiment_project_path / 'tokenizer.pkl'
        
        if model_path.exists() and tokenizer_path.exists():
            dl_model = keras.models.load_model(model_path)
            with open(tokenizer_path, 'rb') as f:
                dl_tokenizer = pickle.load(f)
            print("✅ DL models loaded successfully", file=sys.stderr)
            return True
        else:
            print(f"⚠️ DL model files not found", file=sys.stderr)
            return False
    except Exception as e:
        print(f"❌ Error loading DL models: {e}", file=sys.stderr)
        return False

def predict_sentiment_ml(text):
    """Predict sentiment using ML model"""
    if ml_model is None or vectorizer is None:
        raise Exception("ML models not loaded")
    
    # Preprocess text
    processed_text = preprocess_text(text)
    
    if not processed_text:
        return {
            'label': 'Neutral',
            'score': 0.5,
            'confidence': 0.5
        }
    
    # Vectorize
    text_vectorized = vectorizer.transform([processed_text])
    
    # Predict
    prediction = ml_model.predict(text_vectorized)[0]
    
    # Get prediction probabilities if available
    try:
        probabilities = ml_model.predict_proba(text_vectorized)[0]
        confidence = float(max(probabilities))
    except:
        confidence = 0.7
    
    # Map prediction to label (0: Negative, 1: Neutral, 2: Positive)
    label_map = {0: 'Negative', 1: 'Neutral', 2: 'Positive'}
    label = label_map.get(prediction, 'Neutral')
    
    # Calculate score (0-1 scale where 0.5 is neutral)
    if label == 'Positive':
        score = 0.5 + (confidence * 0.5)
    elif label == 'Negative':
        score = 0.5 - (confidence * 0.5)
    else:
        score = 0.5
    
    return {
        'label': label,
        'score': round(score, 3),
        'confidence': round(confidence, 3)
    }

def predict_sentiment_dl(text):
    """Predict sentiment using DL model"""
    if dl_model is None or dl_tokenizer is None:
        raise Exception("DL models not loaded")
    
    # Preprocess text
    processed_text = preprocess_text(text)
    
    if not processed_text:
        return {
            'label': 'Neutral',
            'score': 0.5,
            'confidence': 0.5
        }
    
    # Tokenize and pad
    sequence = dl_tokenizer.texts_to_sequences([processed_text])
    maxlen = 200  # Should match training maxlen
    padded = tf.keras.preprocessing.sequence.pad_sequences(sequence, maxlen=maxlen)
    
    # Predict
    prediction = dl_model.predict(padded, verbose=0)[0]
    predicted_class = np.argmax(prediction)
    confidence = float(max(prediction))
    
    # Map prediction to label
    label_map = {0: 'Negative', 1: 'Neutral', 2: 'Positive'}
    label = label_map.get(predicted_class, 'Neutral')
    
    # Calculate score
    if label == 'Positive':
        score = 0.5 + (confidence * 0.5)
    elif label == 'Negative':
        score = 0.5 - (confidence * 0.5)
    else:
        score = 0.5
    
    return {
        'label': label,
        'score': round(score, 3),
        'confidence': round(confidence, 3)
    }

def analyze_sentiment(text, use_deep_learning=False):
    """
    Main function to analyze sentiment
    Returns: {'label': 'Positive'|'Neutral'|'Negative', 'score': float, 'confidence': float}
    """
    if not text or not isinstance(text, str):
        return {
            'label': 'Neutral',
            'score': 0.5,
            'confidence': 0.5
        }
    
    try:
        if use_deep_learning and dl_model is not None:
            return predict_sentiment_dl(text)
        elif ml_model is not None:
            return predict_sentiment_ml(text)
        else:
            # Fallback: simple keyword-based sentiment
            return simple_sentiment_analysis(text)
    except Exception as e:
        print(f"Error in sentiment analysis: {e}", file=sys.stderr)
        return {
            'label': 'Neutral',
            'score': 0.5,
            'confidence': 0.3
        }

def simple_sentiment_analysis(text):
    """Simple fallback sentiment analysis using keywords"""
    positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'helpful', 'professional', 'satisfied', 'happy']
    negative_words = ['bad', 'terrible', 'awful', 'poor', 'disappointed', 'unhappy', 'worst', 'horrible']
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count > negative_count:
        return {'label': 'Positive', 'score': 0.7, 'confidence': 0.5}
    elif negative_count > positive_count:
        return {'label': 'Negative', 'score': 0.3, 'confidence': 0.5}
    else:
        return {'label': 'Neutral', 'score': 0.5, 'confidence': 0.5}

# Initialize models on import
if __name__ != '__main__':
    # Try to load ML models first (faster)
    if not load_ml_models():
        # Fallback to DL if ML fails
        load_dl_models()
        use_dl = True

# Command-line interface for testing
if __name__ == '__main__':
    # Load models
    if not load_ml_models():
        if load_dl_models():
            use_dl = True
        else:
            print("❌ Failed to load any models", file=sys.stderr)
            sys.exit(1)
    
    # Read input from stdin
    try:
        input_data = json.loads(sys.stdin.read())
        text = input_data.get('text', '')
        use_dl_flag = input_data.get('use_dl', use_dl)
        
        result = analyze_sentiment(text, use_dl_flag)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'label': 'Neutral',
            'score': 0.5,
            'confidence': 0.3
        }), file=sys.stderr)
        sys.exit(1)

