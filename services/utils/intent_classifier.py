# -*- coding: utf-8 -*-
"""
Intent Classifier
Advanced intent detection for chatbot messages
"""

import re
from typing import Dict, Optional, Tuple, List
from enum import Enum
import logging

from .nlp_utils import IntentPatterns, TextNormalizer, ConversationAnalyzer

logger = logging.getLogger(__name__)


class IntentType(Enum):
    """Intent types"""
    EXIT = "exit"
    GREETING = "greeting"
    HOW_ARE_YOU = "how_are_you"
    THANK_YOU = "thank_you"
    IM_FINE = "im_fine"
    QUESTION = "question"
    MEDICINE_REQUEST = "medicine_request"
    MEDICINE_DETAIL = "medicine_detail"
    DISEASE_MENTION = "disease_mention"
    SYMPTOM_DESCRIPTION = "symptom_description"
    CLARIFICATION_RESPONSE = "clarification_response"
    GENERAL = "general"


class IntentClassifier:
    """Classify user intent from messages"""
    
    def __init__(self):
        self.patterns = IntentPatterns()
        self.normalizer = TextNormalizer()
        self.analyzer = ConversationAnalyzer()
    
    def classify(self, text: str, context: Dict) -> Tuple[IntentType, Dict]:
        """
        Classify user intent
        
        Returns:
            (IntentType, metadata_dict)
        """
        text_lower = text.lower().strip()
        normalized = self.normalizer.normalize(text)
        
        # Check for clarification response first
        if context.get('pending_clarification'):
            return IntentType.CLARIFICATION_RESPONSE, {}
        
        # Exit commands (highest priority)
        if self.patterns.match_patterns(text_lower, IntentPatterns.EXIT_PATTERNS):
            return IntentType.EXIT, {}
        
        # How are you (before greeting to avoid confusion)
        if text_lower in ['how are you', 'how are you?', "how're you", "how're you?"]:
            return IntentType.HOW_ARE_YOU, {}
        
        if self.patterns.match_patterns(text_lower, IntentPatterns.HOW_ARE_YOU_PATTERNS):
            return IntentType.HOW_ARE_YOU, {}
        
        # Greetings
        is_short_greeting = (len(text.split()) <= 2 and 
                            text_lower in ['hi', 'hello', 'hey', 'wth', 'ok', 'yes', 'no', 'hii', 'helloo'])
        
        if is_short_greeting or self.patterns.match_patterns(text_lower, IntentPatterns.GREETING_PATTERNS):
            return IntentType.GREETING, {}
        
        # Thank you
        if self.patterns.match_patterns(text_lower, IntentPatterns.THANK_YOU_PATTERNS):
            return IntentType.THANK_YOU, {}
        
        # I'm fine
        if self.patterns.match_patterns(text_lower, IntentPatterns.IM_FINE_PATTERNS):
            return IntentType.IM_FINE, {}
        
        # Medicine detail queries (if we have medicine context)
        if context.get('last_disease_meds') or context.get('last_disease_name'):
            medicine_matches = self.patterns.extract_with_pattern(
                text_lower, IntentPatterns.MEDICINE_DETAIL_PATTERNS
            )
            if medicine_matches:
                # Determine query type
                query_type = None
                if 'generic' in text_lower:
                    query_type = 'generic_name'
                elif 'side effect' in text_lower:
                    query_type = 'side_effects'
                elif 'brand' in text_lower:
                    query_type = 'brand_names'
                elif 'detail' in text_lower or 'information' in text_lower:
                    query_type = 'full_details'
                
                return IntentType.MEDICINE_DETAIL, {
                    'query_type': query_type,
                    'medicine_name': medicine_matches[0] if medicine_matches else None
                }
        
        # Questions (check before symptom detection)
        is_question = self.patterns.match_patterns(text_lower, IntentPatterns.QUESTION_PATTERNS)
        
        if is_question:
            # Check if it's a medicine request question
            medicine_request_matches = self.patterns.extract_with_pattern(
                text_lower, IntentPatterns.MEDICINE_REQUEST_PATTERNS
            )
            if medicine_request_matches:
                return IntentType.MEDICINE_REQUEST, {
                    'disease_name': medicine_request_matches[0]
                }
            
            # Otherwise, it's a general question
            return IntentType.QUESTION, {}
        
        # Check for symptom indicators FIRST before disease mentions
        # Common symptom phrases that should be treated as symptoms, not diseases
        symptom_indicators = [
            'hurt', 'hurts', 'hurting', 'ache', 'aches', 'aching',
            'pain', 'pains', 'feeling', 'feel', 'feels',
            'tired', 'nauseous', 'sick', 'vomiting', 'coughing',
            'have', 'got', 'getting', 'experiencing'
        ]
        
        has_symptom_indicators = any(indicator in text_lower for indicator in symptom_indicators)
        
        # If text has symptom indicators, prioritize symptom extraction
        # Only check for disease mentions if no clear symptom indicators
        if not has_symptom_indicators:
            # Disease mentions (for medicine recommendations) - only if no symptom indicators
            disease_matches = self.patterns.extract_with_pattern(
                text_lower, IntentPatterns.DISEASE_MENTION_PATTERNS
            )
            if disease_matches:
                return IntentType.DISEASE_MENTION, {
                    'disease_candidates': disease_matches
                }
        
        # Default: symptom description or general
        # This will be determined by symptom extraction
        return IntentType.SYMPTOM_DESCRIPTION, {}
    
    def get_intent_confidence(self, intent: IntentType, text: str, context: Dict) -> float:
        """Get confidence score for intent classification (0.0 to 1.0)"""
        text_lower = text.lower().strip()
        
        # High confidence for exact matches
        if intent == IntentType.EXIT and text_lower in ['exit', 'quit', 'bye', 'goodbye']:
            return 1.0
        
        if intent == IntentType.HOW_ARE_YOU and text_lower in ['how are you', 'how are you?']:
            return 1.0
        
        # Pattern matches get medium-high confidence
        if intent in [IntentType.GREETING, IntentType.THANK_YOU, IntentType.IM_FINE]:
            return 0.8
        
        # Question detection
        if intent == IntentType.QUESTION:
            # Higher confidence if ends with question mark
            if text_lower.endswith('?'):
                return 0.9
            return 0.7
        
        # Medicine requests
        if intent == IntentType.MEDICINE_REQUEST:
            return 0.85
        
        # Medicine details (high confidence if context exists)
        if intent == IntentType.MEDICINE_DETAIL:
            if context.get('last_disease_meds') or context.get('last_disease_name'):
                return 0.9
            return 0.5
        
        # Disease mentions
        if intent == IntentType.DISEASE_MENTION:
            return 0.75
        
        # Symptom description (default, lower confidence)
        if intent == IntentType.SYMPTOM_DESCRIPTION:
            return 0.6
        
        # General fallback
        return 0.5

