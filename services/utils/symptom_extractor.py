# -*- coding: utf-8 -*-
"""
Dynamic Symptom Extraction Module
Uses embedding-based similarity matching for symptom detection
Supports English, Urdu, and mixed language input
"""

import os
import json
import re
import sys
import numpy as np
from typing import List, Dict, Tuple, Optional

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    # Don't print emoji on Windows - just pass silently
    pass  # sentence-transformers not available

# Global variables
_canonical_symptoms = None
_symptom_embeddings = None
_embedding_model = None
SIMILARITY_THRESHOLD = 0.70

def load_canonical_symptoms() -> List[str]:
    """Load canonical symptoms from JSON file"""
    global _canonical_symptoms
    if _canonical_symptoms is not None:
        return _canonical_symptoms
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    symptoms_path = os.path.join(base_dir, 'data', 'chatbot', 'canonicalSymptoms.json')
    
    try:
        with open(symptoms_path, 'r', encoding='utf-8') as f:
            _canonical_symptoms = json.load(f)
        print(f"✅ Loaded {len(_canonical_symptoms)} canonical symptoms")
        return _canonical_symptoms
    except FileNotFoundError:
        print(f"⚠️ Canonical symptoms file not found: {symptoms_path}")
        return []
    except Exception as e:
        print(f"❌ Error loading canonical symptoms: {str(e)}")
        return []

def detect_language(text: str) -> str:
    """
    Detect if text contains Urdu or is primarily English
    Returns 'urdu', 'english', or 'mixed'
    """
    # Urdu Unicode range: \u0600-\u06FF
    urdu_pattern = re.compile(r'[\u0600-\u06FF]+')
    urdu_chars = len(urdu_pattern.findall(text))
    total_chars = len(re.sub(r'\s+', '', text))
    
    if total_chars == 0:
        return 'english'
    
    urdu_ratio = urdu_chars / total_chars if total_chars > 0 else 0
    
    if urdu_ratio > 0.3:
        if urdu_ratio > 0.7:
            return 'urdu'
        return 'mixed'
    return 'english'

def clean_text(text: str) -> str:
    """
    Clean and normalize text for better matching
    - Lowercase
    - Remove extra whitespace
    - Keep medical keywords
    """
    # Convert to lowercase
    text = text.lower().strip()
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove common stopwords but keep medical terms
    # We'll keep all words for now as medical terms are important
    return text

def load_embedding_model():
    """Load the embedding model (lazy loading)"""
    global _embedding_model
    
    if _embedding_model is not None:
        return _embedding_model
    
    if not EMBEDDINGS_AVAILABLE:
        return None
    
    try:
        # Use multilingual model for Urdu support
        # all-MiniLM-L6-v2 is faster but English only
        # multilingual-MiniLM-L12-v2 supports 50+ languages including Urdu
        print("⚡ Loading embedding model (this may take a moment on first run)...")
        _embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        print("✅ Embedding model loaded successfully")
        return _embedding_model
    except Exception as e:
        print(f"⚠️ Error loading embedding model: {str(e)}")
        print("💡 Falling back to keyword-based matching")
        return None

def compute_embeddings(texts: List[str]) -> np.ndarray:
    """Compute embeddings for a list of texts"""
    model = load_embedding_model()
    if model is None:
        return None
    
    try:
        embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return embeddings
    except Exception as e:
        print(f"⚠️ Error computing embeddings: {str(e)}")
        return None

def load_symptom_embeddings() -> Optional[np.ndarray]:
    """Load or compute symptom embeddings"""
    global _symptom_embeddings
    
    if _symptom_embeddings is not None:
        return _symptom_embeddings
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    embeddings_path = os.path.join(base_dir, 'data', 'chatbot', 'symptomEmbeddings.json')
    canonical_symptoms = load_canonical_symptoms()
    
    if not canonical_symptoms:
        return None
    
    # Try to load cached embeddings
    if os.path.exists(embeddings_path):
        try:
            with open(embeddings_path, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                cached_symptoms = cached_data.get('symptoms', [])
                cached_embeddings = np.array(cached_data.get('embeddings', []))
            
            # Check if canonical symptoms match cached ones
            if cached_symptoms == canonical_symptoms and len(cached_embeddings) == len(canonical_symptoms):
                _symptom_embeddings = cached_embeddings
                print(f"✅ Loaded cached embeddings for {len(canonical_symptoms)} symptoms")
                return _symptom_embeddings
            else:
                print("⚠️ Cached embeddings don't match canonical symptoms, recomputing...")
        except Exception as e:
            print(f"⚠️ Error loading cached embeddings: {str(e)}, recomputing...")
    
    # Compute new embeddings
    print("⚡ Computing embeddings for canonical symptoms (this may take a moment)...")
    embeddings = compute_embeddings(canonical_symptoms)
    
    if embeddings is not None:
        _symptom_embeddings = embeddings
        
        # Cache the embeddings
        try:
            os.makedirs(os.path.dirname(embeddings_path), exist_ok=True)
            with open(embeddings_path, 'w', encoding='utf-8') as f:
                json.dump({
                    'symptoms': canonical_symptoms,
                    'embeddings': embeddings.tolist()
                }, f, ensure_ascii=False, indent=2)
            print(f"✅ Cached embeddings to {embeddings_path}")
        except Exception as e:
            print(f"⚠️ Could not cache embeddings: {str(e)}")
    
    return _symptom_embeddings

def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors"""
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)

def extract_symptoms_embedding(text: str, threshold: float = SIMILARITY_THRESHOLD) -> List[Tuple[str, float]]:
    """
    Extract symptoms using embedding similarity
    Returns list of (symptom, confidence) tuples
    """
    canonical_symptoms = load_canonical_symptoms()
    if not canonical_symptoms:
        return []
    
    symptom_embeddings = load_symptom_embeddings()
    if symptom_embeddings is None:
        return []
    
    # Clean and prepare input text
    cleaned_text = clean_text(text)
    
    # Compute embedding for input text
    input_embedding = compute_embeddings([cleaned_text])
    if input_embedding is None or len(input_embedding) == 0:
        return []
    
    input_embedding = input_embedding[0]
    
    # Compute similarities
    results = []
    for i, symptom in enumerate(canonical_symptoms):
        similarity = cosine_similarity(input_embedding, symptom_embeddings[i])
        if similarity >= threshold:
            results.append((symptom, float(similarity)))
    
    # Sort by confidence (highest first)
    results.sort(key=lambda x: x[1], reverse=True)
    
    return results

def extract_symptoms_keyword_fallback(text: str) -> List[str]:
    """
    Fallback keyword-based extraction when embeddings are not available
    Simple pattern matching against canonical symptoms
    """
    canonical_symptoms = load_canonical_symptoms()
    if not canonical_symptoms:
        return []
    
    cleaned_text = clean_text(text)
    detected = []
    
    for symptom in canonical_symptoms:
        # Check if symptom words appear in text
        symptom_words = symptom.split()
        if all(word in cleaned_text for word in symptom_words):
            detected.append(symptom)
    
    return detected

def detect_symptoms(text: str, use_ai_fallback: bool = True) -> List[str]:
    """
    Main function to detect symptoms from user input
    Combines embedding similarity with optional AI fallback
    
    Args:
        text: User input text
        use_ai_fallback: Whether to use GPT fallback for ambiguous cases
    
    Returns:
        List of detected canonical symptom names
    """
    if not text or not text.strip():
        return []
    
    # Try embedding-based extraction first
    embedding_results = extract_symptoms_embedding(text)
    
    if embedding_results:
        # Return top matches (confidence >= threshold)
        return [symptom for symptom, confidence in embedding_results]
    
    # Fallback to keyword matching if embeddings failed
    keyword_results = extract_symptoms_keyword_fallback(text)
    if keyword_results:
        return keyword_results
    
    # If still no results and AI fallback is enabled, try GPT
    if use_ai_fallback:
        try:
            ai_results = map_symptoms_ai(text)
            if ai_results:
                return ai_results
        except Exception as e:
            print(f"⚠️ AI fallback failed: {str(e)}")
    
    return []

def map_symptoms_ai(text: str) -> List[str]:
    """
    Use GPT API to map symptoms (fallback for ambiguous cases)
    Requires OPENAI_API_KEY environment variable
    """
    try:
        from openai import OpenAI
    except ImportError:
        print("⚠️ OpenAI library not available. Install with: pip install openai")
        return []
    
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("⚠️ OPENAI_API_KEY not set, skipping AI fallback")
        return []
    
    canonical_symptoms = load_canonical_symptoms()
    if not canonical_symptoms:
        return []
    
    try:
        client = OpenAI(api_key=api_key)
        
        prompt = f"""Extract medical symptoms from the following text and map them to standardized clinical symptom names.

User input: "{text}"

Canonical symptom list: {', '.join(canonical_symptoms[:50])}

Instructions:
1. Identify all medical symptoms mentioned in the user input
2. Map each symptom to the closest matching canonical symptom name
3. Return ONLY the canonical symptom names, one per line
4. If no symptoms are found, return "NONE"
5. Do not include explanations or additional text

Mapped symptoms:"""

        response = client.completions.create(
            model="gpt-3.5-turbo-instruct",
            prompt=prompt,
            max_tokens=100,
            temperature=0.1
        )
        
        result_text = response.choices[0].text.strip()
        
        if result_text.upper() == "NONE":
            return []
        
        # Parse results
        mapped_symptoms = []
        for line in result_text.split('\n'):
            symptom = line.strip()
            if symptom in canonical_symptoms:
                mapped_symptoms.append(symptom)
        
        return mapped_symptoms
        
    except Exception as e:
        print(f"⚠️ Error in AI symptom mapping: {str(e)}")
        return []

