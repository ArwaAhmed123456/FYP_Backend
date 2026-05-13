# -*- coding: utf-8 -*-
"""
Response Generator
Generate natural, ChatGPT-like responses with medical safety
"""

import random
from typing import Dict, List, Optional, Tuple
import logging

from .nlp_utils import SeverityScorer, ConversationAnalyzer

logger = logging.getLogger(__name__)


class ResponseGenerator:
    """Generate natural, contextual responses"""
    
    # Medical disclaimer templates (no emojis)
    MEDICAL_DISCLAIMER = (
        "\n\n**Important**: I'm an AI assistant and cannot provide medical diagnoses. "
        "The information I share is for educational purposes only. "
        "For any serious or persistent symptoms, please consult a healthcare professional."
    )
    
    URGENT_DISCLAIMER = (
        "\n\n**Please seek immediate medical attention** if you're experiencing "
        "severe symptoms, difficulty breathing, chest pain, or any life-threatening condition."
    )
    
    def __init__(self):
        self.severity_scorer = SeverityScorer()
        self.analyzer = ConversationAnalyzer()
    
    def generate_greeting(self, context: Dict) -> str:
        """Generate contextual greeting"""
        symptoms_count = len(context.get('all_detected_symptoms', []))
        
        if symptoms_count == 0:
            greetings = [
                "Hello! I'm your Health Assistant. I'm here to help you understand possible health conditions based on your symptoms. How are you feeling today?",
                "Hi there! I'm here to assist with health-related questions. What symptoms are you experiencing?",
                "Hey! Let's work together to understand what might be causing your discomfort. Can you tell me about your symptoms?",
                "Hello! I'm your Health Assistant. I can help explore possible conditions, but remember I'm not a doctor. What symptoms are you experiencing?"
            ]
        else:
            greetings = [
                "Hi again! I'm still here to help. Would you like to describe more symptoms, or do you have questions about the previous possibilities we discussed?",
                "Hello! How can I assist you further? You can share more symptoms or ask about medicines for the conditions we discussed.",
                "Hey! What else can I help you with? Feel free to describe additional symptoms or ask any health questions."
            ]
        
        return random.choice(greetings)
    
    def generate_how_are_you_response(self) -> str:
        """Generate response to 'how are you'"""
        responses = [
            "I'm doing well, thank you for asking! I'm here to help with your health concerns. How are you feeling? What symptoms are you experiencing?",
            "I'm great, thanks! I'm ready to help you. Can you tell me about any symptoms you're experiencing?",
            "I'm here and ready to help! How are you feeling today? Please describe any symptoms you have."
        ]
        return random.choice(responses)
    
    def generate_thank_you_response(self) -> str:
        """Generate response to thank you"""
        responses = [
            "You're very welcome! I'm glad I could help. Is there anything else you'd like to know? Feel free to describe more symptoms or ask questions.",
            "Happy to help! Let me know if you need anything else or have more symptoms to share.",
            "You're welcome! I'm here whenever you need assistance. What else can I help you with?"
        ]
        return random.choice(responses)
    
    def generate_im_fine_response(self) -> str:
        """Generate response to 'I'm fine'"""
        responses = [
            "That's wonderful to hear! If you do experience any symptoms or have health concerns in the future, feel free to describe them. I'm here to help!",
            "Great! I'm glad you're feeling well. If you have any symptoms you'd like to discuss or health questions, I'm here to assist.",
            "That's good news! If you're ever experiencing any discomfort or have symptoms, please describe them and I can help explore possible causes."
        ]
        return random.choice(responses)
    
    def generate_disease_prediction_response(
        self, 
        diseases: List[Tuple[str, float]], 
        symptoms: List[str],
        severity_level: str
    ) -> str:
        """Generate response for disease predictions"""
        if not diseases:
            return (
                "I understand you're experiencing symptoms, but I need more information to provide helpful insights. "
                "Could you please describe 2-3 specific symptoms you're experiencing? "
                "The more details you share, the better I can help."
            )
        
        response = "Based on the symptoms you've described, here are some **possible conditions** that might be relevant:\n\n"
        
        for i, (disease, confidence) in enumerate(diseases, 1):
            response += f"{i}. **{disease.replace('_', ' ').title()}** (Confidence: {confidence:.0f}%)\n"
        
        response += "\n**What you can do next:**\n"
        response += "• Tell me one of these conditions and I can suggest medicines commonly used for it\n"
        response += "• Describe any additional symptoms for more accurate insights\n"
        response += "• Ask questions about any of these conditions\n"
        
        # Add severity-based advice
        if severity_level == 'high':
            response += self.URGENT_DISCLAIMER
        else:
            response += self.MEDICAL_DISCLAIMER
        
        return response
    
    def generate_symptom_prompt_response(
        self, 
        prompt_count: int, 
        existing_symptoms: List[str]
    ) -> str:
        """Generate response prompting for more symptoms - less repetitive"""
        if existing_symptoms and len(existing_symptoms) > 0:
            # We have some symptoms, acknowledge them
            symptom_list = ', '.join([s.replace('_', ' ') for s in existing_symptoms[:2]])
            if prompt_count == 1:
                prompts = [
                    f"I understand you mentioned {symptom_list}. Could you describe 1-2 additional symptoms you're experiencing? This will help me provide more accurate insights.",
                    f"Thank you for sharing about {symptom_list}. To better understand your condition, please describe 1-2 more symptoms you've noticed.",
                ]
            else:
                prompts = [
                    f"Based on {symptom_list}, let me provide some insights. However, describing 1-2 more symptoms would help me be more accurate.",
                    f"I can work with {symptom_list}, but additional symptoms would improve the analysis.",
                ]
        else:
            # No symptoms detected
            if prompt_count == 1:
                prompts = [
                    "I'd like to help you. Could you please describe what symptoms you're experiencing? For example: 'I have a headache and feel nauseous' or 'My stomach hurts and I feel tired'.",
                    "To provide helpful insights, please describe your symptoms. Examples: fever and cough, or stomach pain and nausea.",
                ]
            else:
                prompts = [
                    "I'm having trouble understanding your symptoms. Could you describe what you're feeling? For example: 'I have a headache' or 'My stomach hurts'.",
                    "Please describe your symptoms in detail. What physical discomfort are you experiencing?",
                ]
        
        return random.choice(prompts)
    
    def generate_medicine_recommendation_response(
        self, 
        disease_name: str, 
        medicines: List[Dict]
    ) -> str:
        """Generate response for medicine recommendations"""
        if not medicines:
            return (
                f"I couldn't find specific medicines for **{disease_name}** in my database. "
                "Please consult a healthcare professional for appropriate treatment options."
            )
        
        response = f"Here are medicines commonly used for **{disease_name.replace('_', ' ').title()}**:\n\n"
        
        for i, med in enumerate(medicines[:5], 1):
            med_name = med.get('drug_name', 'Unknown')
            response += f"{i}. {med_name}\n"
        
        response += "\n**You can ask me:**\n"
        response += "• \"What's the generic name of [medicine]?\"\n"
        response += "• \"What are the side effects of [medicine]?\"\n"
        response += "• \"What are the brand names of [medicine]?\"\n"
        response += "• \"Full details of [medicine]\"\n"
        response += "\nOr tell me another disease or describe more symptoms."
        
        response += self.MEDICAL_DISCLAIMER
        
        return response
    
    def generate_medicine_detail_response(
        self, 
        medicine_name: str, 
        details: Dict, 
        query_type: str
    ) -> str:
        """Generate response for medicine detail queries"""
        med_display = medicine_name.title()
        
        if query_type == 'generic_name':
            generic = details.get('generic_name', 'N/A')
            return (
                f"The generic name for **{med_display}** is:\n"
                f"→ **{generic}**\n\n"
                "This is the main active ingredient that doctors rely on for this condition."
            )
        
        elif query_type == 'side_effects':
            side_effects = details.get('side_effects', 'N/A')
            return (
                f"Here are the common side effects of **{med_display}**:\n"
                f"{side_effects}\n\n"
                "If you experience any unusual side effects, it's important to discuss them with a healthcare professional."
            )
        
        elif query_type == 'brand_names':
            brand_names = details.get('brand_names', 'N/A')
            return (
                f"Here are brand names commonly associated with **{med_display}**:\n"
                f"{brand_names}\n\n"
                "These are different brands that contain the same active ingredient."
            )
        
        elif query_type == 'full_details':
            response = f"Here's a complete overview of **{med_display}**:\n\n"
            response += f"• **Brand Names**: {details.get('brand_names', 'N/A')}\n"
            response += f"• **Generic Name**: {details.get('generic_name', 'N/A')}\n"
            response += f"• **Side Effects**: {details.get('side_effects', 'N/A')}\n\n"
            response += "Let me know if you'd like anything explained further."
            return response
        
        return f"I found information about **{med_display}**, but couldn't retrieve the specific details you requested."
    
    def generate_qa_response(self, answer: str, confidence: float = 1.0) -> str:
        """Generate response for Q&A queries"""
        if confidence < 0.5:
            return (
                f"{answer}\n\n"
                "I'm not entirely certain about this answer. For more accurate information, "
                "please consult a healthcare professional or reliable medical source."
            )
        return answer
    
    def generate_clarification_request(
        self, 
        ambiguous_words: Dict[str, List[str]]
    ) -> Tuple[str, List[str]]:
        """Generate clarification request message"""
        if len(ambiguous_words) == 1:
            word = list(ambiguous_words.keys())[0]
            options = ambiguous_words[word]
            if len(options) >= 2:
                message = (
                    f"I'm not entirely sure what you meant by '{word}'. "
                    f"Did you mean '{options[0]}' or '{options[1]}'?\n\n"
                    f"Please reply with '{options[0]}' or '{options[1]}'."
                )
                return message, options[:2]
            else:
                message = f"Could you clarify what you meant by '{word}'?"
                return message, options
        else:
            message = "I need clarification on a few words:\n"
            all_options = []
            for word, options in ambiguous_words.items():
                if len(options) >= 2:
                    message += f"• Did you mean '{options[0]}' or '{options[1]}' for '{word}'?\n"
                    all_options.extend(options[:2])
                else:
                    message += f"• Could you clarify '{word}'?\n"
                    all_options.extend(options)
            message += "\nPlease reply with the correct word for each."
            return message, list(set(all_options))
    
    def generate_exit_response(self) -> str:
        """Generate exit message"""
        responses = [
            "Take care! If you ever need help again, I'll be right here. Remember to consult a healthcare professional for any serious concerns.",
            "Goodbye! Stay healthy, and don't hesitate to reach out if you need assistance.",
            "Take care! I'm here whenever you need help with health questions."
        ]
        return random.choice(responses)
    
    def add_follow_up_suggestions(
        self, 
        base_response: str, 
        context: Dict,
        symptoms: List[str]
    ) -> str:
        """Add contextual follow-up suggestions to response"""
        # This will be enhanced by FollowUpQuestionGenerator
        return base_response

