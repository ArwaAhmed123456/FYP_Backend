# -*- coding: utf-8 -*-
"""
Follow-up Question Generator
Generate dynamic, contextual follow-up questions
"""

import random
from typing import List, Dict, Set, Optional
import logging

logger = logging.getLogger(__name__)


class FollowUpQuestionGenerator:
    """Generate contextual follow-up questions"""
    
    # Symptom categories for related questions
    SYMPTOM_CATEGORIES = {
        'fever': ['chills', 'sweating', 'body_ache', 'fatigue'],
        'headache': ['dizziness', 'nausea', 'sensitivity_to_light', 'neck_pain'],
        'cough': ['chest_pain', 'shortness_of_breath', 'sore_throat', 'fever'],
        'stomach_pain': ['nausea', 'vomiting', 'diarrhea', 'bloating'],
        'fatigue': ['weakness', 'dizziness', 'sleep_problems', 'fever'],
        'nausea': ['vomiting', 'stomach_pain', 'dizziness', 'loss_of_appetite'],
        'chest_pain': ['shortness_of_breath', 'dizziness', 'sweating', 'nausea'],
        'sore_throat': ['fever', 'cough', 'difficulty_swallowing', 'swollen_glands'],
    }
    
    # Duration questions
    DURATION_QUESTIONS = [
        "How long have you been experiencing {symptom}?",
        "When did {symptom} start?",
        "How long has this been going on?",
    ]
    
    # Severity questions
    SEVERITY_QUESTIONS = [
        "How severe is your {symptom}?",
        "On a scale of 1-10, how would you rate your {symptom}?",
        "Is your {symptom} mild, moderate, or severe?",
    ]
    
    # Related symptom questions
    RELATED_SYMPTOM_QUESTIONS = [
        "Do you also experience {related_symptom}?",
        "Are you also feeling {related_symptom}?",
        "Have you noticed any {related_symptom}?",
    ]
    
    # Context questions
    CONTEXT_QUESTIONS = [
        "What makes your {symptom} better or worse?",
        "Does anything trigger your {symptom}?",
        "Have you noticed any patterns with your {symptom}?",
    ]
    
    def __init__(self):
        self.asked_questions = set()  # Track asked questions in session
    
    def generate_symptom_follow_ups(
        self, 
        detected_symptoms: List[str], 
        context: Dict,
        max_questions: int = 2
    ) -> List[str]:
        """Generate follow-up questions based on detected symptoms"""
        questions = []
        
        if not detected_symptoms:
            return questions
        
        # Get symptom history to avoid repetition
        symptom_history = context.get('all_detected_symptoms', [])
        if isinstance(symptom_history, list):
            symptom_history = set(symptom_history)
        
        # Find related symptoms that haven't been mentioned
        for symptom in detected_symptoms:
            related = self.SYMPTOM_CATEGORIES.get(symptom, [])
            for related_symptom in related:
                if related_symptom not in symptom_history:
                    question = random.choice(self.RELATED_SYMPTOM_QUESTIONS).format(
                        related_symptom=related_symptom.replace('_', ' ')
                    )
                    questions.append(question)
                    if len(questions) >= max_questions:
                        return questions
        
        # If we have symptoms but no related questions, ask about duration/severity
        if not questions and detected_symptoms:
            symptom = detected_symptoms[0].replace('_', ' ')
            if random.random() < 0.5:
                question = random.choice(self.DURATION_QUESTIONS).format(symptom=symptom)
            else:
                question = random.choice(self.SEVERITY_QUESTIONS).format(symptom=symptom)
            questions.append(question)
        
        return questions[:max_questions]
    
    def generate_disease_follow_ups(
        self, 
        disease_name: str, 
        symptoms: List[str],
        context: Dict
    ) -> List[str]:
        """Generate follow-up questions after disease prediction"""
        questions = []
        
        # Ask about common symptoms of the disease that haven't been mentioned
        # This would ideally come from disease-symptom mapping
        # For now, use generic questions
        
        if len(symptoms) < 3:
            questions.append(
                "Would you like to describe any additional symptoms? This can help narrow down the possibilities."
            )
        
        questions.append(
            f"Would you like to know about medicines commonly used for {disease_name.replace('_', ' ')}?"
        )
        
        return questions[:2]
    
    def generate_contextual_prompt(
        self, 
        symptom_count: int, 
        prompt_count: int
    ) -> Optional[str]:
        """Generate contextual prompt based on conversation state"""
        if symptom_count == 0:
            return "What symptoms are you experiencing? Please describe them in detail."
        
        if symptom_count == 1:
            prompts = [
                "Can you describe any other symptoms you're experiencing?",
                "What other symptoms have you noticed?",
                "Are there any other ways you're feeling unwell?",
            ]
            return random.choice(prompts)
        
        if symptom_count >= 2:
            return None  # Enough symptoms, no need for prompt
        
        return None
    
    def generate_medicine_follow_ups(
        self, 
        medicine_name: str, 
        context: Dict
    ) -> List[str]:
        """Generate follow-up questions about medicines"""
        questions = [
            f"Would you like to know more about {medicine_name}?",
            "Would you like to know about side effects or generic names?",
        ]
        return questions[:1]
    
    def format_follow_ups_as_buttons(self, questions: List[str]) -> List[str]:
        """Format questions as clickable button options"""
        return questions
    
    def should_ask_follow_up(self, context: Dict) -> bool:
        """Determine if we should ask follow-up questions"""
        # Don't ask if user just thanked us
        last_intent = context.get('last_intent')
        if last_intent in ['thank_you', 'im_fine']:
            return False
        
        # Ask if we have symptoms but not enough for prediction
        symptoms = context.get('all_detected_symptoms', [])
        symptom_count = len(symptoms) if isinstance(symptoms, (list, set)) else 0
        
        if 0 < symptom_count < 3:
            return True
        
        # Ask after disease prediction
        if context.get('last_disease_name') and not context.get('last_disease_meds'):
            return True
        
        return False

