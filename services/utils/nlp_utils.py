# -*- coding: utf-8 -*-
"""
NLP Utilities
Text preprocessing, normalization, and analysis utilities
"""

import re
import string
from typing import List, Dict, Set, Tuple
import logging

logger = logging.getLogger(__name__)


class TextNormalizer:
    """Normalize and preprocess text for NLP tasks"""
    
    @staticmethod
    def normalize(text: str) -> str:
        """Normalize text: lowercase, remove extra spaces, handle punctuation"""
        if not text:
            return ""
        
        # Lowercase
        text = text.lower().strip()
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Normalize punctuation spacing
        text = re.sub(r'\s*([,.!?;:])\s*', r'\1 ', text)
        
        return text.strip()
    
    @staticmethod
    def remove_punctuation(text: str, keep_apostrophes: bool = True) -> str:
        """Remove punctuation from text"""
        if keep_apostrophes:
            # Keep apostrophes for contractions
            return re.sub(r'[^\w\s\']', '', text)
        return re.sub(r'[^\w\s]', '', text)
    
    @staticmethod
    def tokenize(text: str) -> List[str]:
        """Tokenize text into words"""
        normalized = TextNormalizer.normalize(text)
        # Remove punctuation for tokenization
        cleaned = TextNormalizer.remove_punctuation(normalized)
        return cleaned.split()
    
    @staticmethod
    def extract_phrases(text: str, min_length: int = 2, max_length: int = 4) -> List[str]:
        """Extract n-grams (phrases) from text"""
        tokens = TextNormalizer.tokenize(text)
        phrases = []
        
        for n in range(min_length, max_length + 1):
            for i in range(len(tokens) - n + 1):
                phrase = ' '.join(tokens[i:i+n])
                phrases.append(phrase)
        
        return phrases


class IntentPatterns:
    """Pattern-based intent detection"""
    
    # Exit patterns
    EXIT_PATTERNS = [
        r'^(exit|quit|bye|goodbye|see\s+ya|farewell)$',
        r'^(exit|quit|bye|goodbye)\s+.*',
    ]
    
    # Greeting patterns
    GREETING_PATTERNS = [
        r'^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|sup|what\'?s\s+up|wassup)$',
        r'^(hi|hello|hey)\s+there',
        r'^good\s+(morning|afternoon|evening)',
    ]
    
    # How are you patterns
    HOW_ARE_YOU_PATTERNS = [
        r'^how\s+are\s+you',
        r'^how\s+do\s+you\s+do',
        r'^how\'?s\s+it\s+going',
        r'^what\'?s\s+up\s*\?*$',
        r'^how\s+are\s+you\s+doing',
    ]
    
    # Thank you patterns
    THANK_YOU_PATTERNS = [
        r'^(thanks?|thank\s+you|ty|thx|appreciate\s+it|much\s+appreciated)',
    ]
    
    # I'm fine patterns
    IM_FINE_PATTERNS = [
        r'^(i\'?m\s+)?(fine|ok|okay|good|alright|well|great|doing\s+well)',
    ]
    
    # Question patterns
    QUESTION_PATTERNS = [
        r'^(what|how|why|when|where|which|who|can|could|should|would|is|are|does|do|did)\s+',
        r'\?$',  # Ends with question mark
        r'^(what|how|why|when|where|which|who)\s+is\s+',
        r'^(what|how|why|when|where|which|who)\s+are\s+',
        r'^(what|how|why|when|where|which|who)\s+causes\s+',
        r'^(what|how|why|when|where|which|who)\s+to\s+',
        r'^(what|how|why|when|where|which|who)\s+do\s+',
    ]
    
    # Medicine request patterns
    MEDICINE_REQUEST_PATTERNS = [
        r'medicines?\s+for\s+(\w+)',
        r'medicine\s+for\s+(\w+)',
        r'drugs?\s+for\s+(\w+)',
        r'treatment\s+for\s+(\w+)',
        r'what\s+medicines?\s+for',
        r'medicines?\s+to\s+treat',
    ]
    
    # Disease mention patterns
    DISEASE_MENTION_PATTERNS = [
        r'i\s+have\s+(\w+)',
        r'i\s+got\s+(\w+)',
        r'i\'?m\s+having\s+(\w+)',
        r'(\w+)\s+disease',
        r'(\w+)\s+condition',
        r'i\s+think\s+i\s+have\s+(\w+)',
    ]
    
    # Medicine detail query patterns
    MEDICINE_DETAIL_PATTERNS = [
        r'generic\s+name\s+of\s+(.+)',
        r'side\s+effects?\s+of\s+(.+)',
        r'brand\s+names?\s+of\s+(.+)',
        r'full\s+details?\s+of\s+(.+)',
        r'details?\s+about\s+(.+)',
        r'information\s+about\s+(.+)',
    ]
    
    @staticmethod
    def match_patterns(text: str, patterns: List[str]) -> bool:
        """Check if text matches any pattern"""
        text_lower = text.lower().strip()
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return True
        return False
    
    @staticmethod
    def extract_with_pattern(text: str, patterns: List[str]) -> List[str]:
        """Extract matches from text using patterns"""
        text_lower = text.lower().strip()
        matches = []
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                # Extract groups if any
                if match.groups():
                    matches.extend(match.groups())
                else:
                    matches.append(match.group(0))
        return matches


class SeverityScorer:
    """Score symptom severity based on keywords and context"""
    
    # High severity indicators
    HIGH_SEVERITY_KEYWORDS = {
        'severe', 'intense', 'extreme', 'unbearable', 'excruciating',
        'emergency', 'urgent', 'critical', 'dangerous', 'life-threatening',
        'can\'t breathe', 'difficulty breathing', 'chest pain', 'heart attack',
        'stroke', 'unconscious', 'bleeding heavily', 'severe pain'
    }
    
    # Medium severity indicators
    MEDIUM_SEVERITY_KEYWORDS = {
        'moderate', 'uncomfortable', 'bothersome', 'persistent', 'ongoing',
        'worsening', 'getting worse', 'not improving'
    }
    
    # Duration indicators (longer = potentially more serious)
    DURATION_KEYWORDS = {
        'weeks', 'months', 'years', 'long time', 'for a while',
        'chronic', 'persistent', 'ongoing'
    }
    
    @staticmethod
    def score_severity(text: str, symptoms: List[str]) -> Tuple[float, str]:
        """
        Score symptom severity (0.0 to 1.0)
        Returns: (score, level) where level is 'low', 'medium', or 'high'
        """
        text_lower = text.lower()
        score = 0.0
        
        # Check for high severity keywords
        high_count = sum(1 for keyword in SeverityScorer.HIGH_SEVERITY_KEYWORDS 
                         if keyword in text_lower)
        if high_count > 0:
            score += 0.6 + (min(high_count, 3) * 0.1)
        
        # Check for medium severity keywords
        medium_count = sum(1 for keyword in SeverityScorer.MEDIUM_SEVERITY_KEYWORDS 
                           if keyword in text_lower)
        if medium_count > 0:
            score += 0.3 + (min(medium_count, 2) * 0.1)
        
        # Check duration
        if any(keyword in text_lower for keyword in SeverityScorer.DURATION_KEYWORDS):
            score += 0.2
        
        # Normalize score
        score = min(score, 1.0)
        
        # Determine level
        if score >= 0.7:
            level = 'high'
        elif score >= 0.4:
            level = 'medium'
        else:
            level = 'low'
        
        return score, level
    
    @staticmethod
    def should_recommend_doctor(severity_level: str, symptom_count: int) -> bool:
        """Determine if doctor recommendation should be included"""
        return severity_level in ['high', 'medium'] or symptom_count >= 3


class ConversationAnalyzer:
    """Analyze conversation patterns and context"""
    
    @staticmethod
    def detect_repetition(context: Dict, current_input: str) -> bool:
        """Detect if user is repeating themselves"""
        if 'message_history' not in context:
            return False
        
        history = context.get('message_history', [])
        current_lower = current_input.lower().strip()
        
        # Check last 3 messages for similarity
        for msg in history[-3:]:
            if msg.get('sender') == 'user':
                msg_text = msg.get('text', '').lower().strip()
                # Simple similarity check (can be improved with embeddings)
                if len(set(current_lower.split()) & set(msg_text.split())) >= 3:
                    return True
        
        return False
    
    @staticmethod
    def detect_correction(context: Dict, current_input: str) -> bool:
        """Detect if user is correcting previous information"""
        correction_keywords = ['no', 'not', 'actually', 'correction', 'wrong', 
                              'mistake', 'i meant', 'i meant to say']
        
        current_lower = current_input.lower()
        if any(keyword in current_lower for keyword in correction_keywords):
            return True
        
        return False
    
    @staticmethod
    def get_conversation_stage(context: Dict) -> str:
        """Determine what stage of conversation we're in"""
        symptoms = context.get('all_detected_symptoms', [])
        symptom_count = len(symptoms) if isinstance(symptoms, (list, set)) else 0
        has_disease = bool(context.get('last_disease_name'))
        has_medicines = bool(context.get('last_disease_meds'))
        
        if symptom_count == 0:
            return 'greeting'
        elif symptom_count < 2:
            return 'collecting_symptoms'
        elif has_disease and has_medicines:
            return 'medicine_discussion'
        elif has_disease:
            return 'disease_confirmed'
        elif symptom_count >= 2:
            return 'symptom_analysis'
        else:
            return 'general'


def normalize_text(text: str) -> str:
    """Convenience function for text normalization"""
    return TextNormalizer.normalize(text)


def tokenize_text(text: str) -> List[str]:
    """Convenience function for tokenization"""
    return TextNormalizer.tokenize(text)

