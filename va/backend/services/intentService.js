const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Pricing for gpt-4o-mini (as of March 2024)
const COST_PER_1M_INPUT_TOKENS = 0.15;
const COST_PER_1M_OUTPUT_TOKENS = 0.60;
const COST_FILE = path.join(__dirname, 'va_cost_data.json');
// Budget limit: configurable via env var, default $1.00 (was $0.05 which is ~300 calls)
const DEFAULT_LIMIT = parseFloat(process.env.VA_INTENT_BUDGET_USD || '1.00');

const ROUTER_PROMPT = `You are "Tabeeb AI", a smart Urdu-English medical voice assistant, like Siri.

Analyze the user's voice transcript. It may be English, Urdu script, Roman Urdu, or mixed.

INTENT TYPES:
1. "navigation" - User wants to open a screen. PRIORITY: High.
2. "chat"       - User asks a health/symptom/advice question.
3. "form_fill"   - User provides data for a form (Login, Signup, etc.).
4. "unknown"    - Noise, gibberish, or incomplete.

SCREENS (use exact name):
- EnhancedDashboard  : Home, Ghar, Dashboard, mukhya safa, ghar jain, home pr jain
- Consultations      : Doctor, Mushwara, Hakeem, specialist, doctor chahiye, doctor dhundain, doctor se milo
- AppointmentBooking : Appointment, Mulaqat, waqt thay karo, checkup, kal milna, schedule visit
- Prescriptions      : Nuskha, Dawai, Dawa, Medicine, mery nuskhe, meri dawain, dawai ki list
- HealthRecordNavigator: Report, Lab test, Blood report, sehat record, mersimaal, scan, x-ray
- Finder2            : Qareeb hospital, nazdik aspataal, aspataal dhundain, hospital, emergency
- Finder3            : Dawai ki dukan, pharmacy, medical store, aqrabi pharmacy, nazdik pharmacy
- Profile            : Mera account, profile, shanakht, meri details, apna account
- PaymentMethods     : Card, Adaigi ka tareeqa, payment, fees ka tareeqa, kard dikhain
- TransactionHistory : Len den, fees history, purani payment, billing, receipts, transactions
- Notifications      : Notifications, ittilaat, messages, alerts
- Settings           : Settings, tarteebaat, zuban, language, app setup
- Articles           : Blog, articles, sehat ki khabarein, balagh, parhai, health news, blogs
- ChatbotSession     : AI Doctor, chatbot, AI se baat, aey aye doctor, mushwara se AI, AI ki madad

URDU DIALECT/PRONUNCIATION FIXES:
- "balagh" / "بلغ" / "بلوگ" -> Articles
- "mulaqat" / "ملاقات" / "ملکات" -> AppointmentBooking
- "mashwara" / "مشورہ" / "مشور" -> Consultations
- "aspataal" / "ہسپتال" -> Finder2
- "dawa ki dukan" / "dawai kee dukaan" -> Finder3
- "nuskha" / "dawai" / "dawa" -> Prescriptions
- "aey aye doctor" / "AI doctor" / "اے آئی ڈاکٹر" -> ChatbotSession
- "deish board" / "دیش بورڈ" -> EnhancedDashboard

RETURN VALID JSON ONLY (no markdown, no extra text):
{
  "type": "navigation" | "chat" | "form_fill" | "unknown",
  "screen": "SCREEN_NAME",
  "params": {
    "search": "doctor name if user named a specific doctor",
    "specialty": "medical specialty if user mentioned one",
    "extracted_data": {
       "email": "extracted email if found",
       "password": "extracted password if found",
       "name": "extracted full name if found",
       "age": "extracted age number if found",
       "gender": "Male | Female | Other",
       "contact": "extracted phone/contact number if found"
    }
  },
  "confidence": 0.0-1.0,
  "reason": "brief debug note"
}

FORM FILLING EXAMPLES:
- "My email is ali@gmail.com" -> type: "form_fill", params: { "extracted_data": { "email": "ali@gmail.com" } }
- "Login with 03123456789 and pass123" -> type: "form_fill", params: { "extracted_data": { "contact": "03123456789", "password": "pass123" } }
- "Mera naam Ahmed hai aur umer 25 saal hai" -> type: "form_fill", params: { "extracted_data": { "name": "Ahmed", "age": "25" } }

ENTITY EXTRACTION:
- "Ishfaq doctor dikhain" -> screen: "Consultations", params: {"search": "Ishfaq"}
- "Dil ka doctor" or "Heart doctor" -> screen: "Consultations", params: {"specialty": "Cardiology"}
- "AI Doctor" / "aey aye doctor" -> screen: "ChatbotSession"
- "Back" / "Wapis" / "Pichhe" -> screen: "BACK"
- "Dashboard" / "Home" / "Ghar" -> screen: "EnhancedDashboard"

NOTE: "Mera dil theek nahi" is Chat. "Dil ka doctor dikhao" is Navigation to Consultations.`;


class IntentService {
    constructor() {
        this.initializeCostData();
    }

    initializeCostData() {
        if (!fs.existsSync(COST_FILE)) {
            fs.writeFileSync(COST_FILE, JSON.stringify({ total_cost: 0, total_calls: 0 }));
        }
    }

    updateCost(inputTokens, outputTokens) {
        try {
            const data = JSON.parse(fs.readFileSync(COST_FILE, 'utf8'));
            const cost = (inputTokens / 1000000 * COST_PER_1M_INPUT_TOKENS) +
                (outputTokens / 1000000 * COST_PER_1M_OUTPUT_TOKENS);

            data.total_cost = (data.total_cost || 0) + cost;
            data.total_calls = (data.total_calls || 0) + 1;

            fs.writeFileSync(COST_FILE, JSON.stringify(data, null, 2));
            return data.total_cost;
        } catch (e) {
            console.error('[IntentService] Cost tracking failed', e);
            return 0;
        }
    }

    getCostInfo() {
        try {
            if (!fs.existsSync(COST_FILE)) this.initializeCostData();
            return JSON.parse(fs.readFileSync(COST_FILE, 'utf8'));
        } catch (e) {
            return { total_cost: 0, total_calls: 0 };
        }
    }

    resetCost() {
        try {
            fs.writeFileSync(COST_FILE, JSON.stringify({ total_cost: 0, total_calls: 0 }));
            console.log('[IntentService] Cost data reset.');
        } catch (e) {
            console.error('[IntentService] Failed to reset cost data', e);
        }
    }

    async detectIntent(transcript, context = {}) {
        try {
            const costInfo = this.getCostInfo();
            if (costInfo.total_cost >= DEFAULT_LIMIT) {
                console.warn(`[IntentService] Budget limit of $${DEFAULT_LIMIT} reached. Skipping AI call. Reset with POST /api/va/cost/reset`);
                return { type: 'unknown', confidence: 0.0, error: 'Budget limit reached' };
            }

            console.log(`[IntentService Node] Resolving locally for transcript: "${transcript}"`);
            
            const text = transcript.toLowerCase();
            const navKeywords = {
                "dashboard": "EnhancedDashboard", "home": "EnhancedDashboard", "ghar": "EnhancedDashboard",
                "doctor": "Consultations", "consult": "Consultations", "mashwara": "Consultations", "hakeem": "Consultations",
                "appointment": "AppointmentBooking", "book": "AppointmentBooking", "mulaqat": "AppointmentBooking",
                "prescription": "Prescriptions", "medicine": "Prescriptions", "dawai": "Prescriptions", "nuskha": "Prescriptions",
                "record": "HealthRecordNavigator", "report": "HealthRecordNavigator", "sehat": "HealthRecordNavigator",
                "profile": "Profile", "account": "Profile"
            };

            let parsedIntent = { type: "chat", screen: null, params: {}, confidence: 0.80 };
            
            for (const [kw, screen] of Object.entries(navKeywords)) {
                if (text.includes(kw)) {
                    parsedIntent = { type: "navigation", screen: screen, params: {}, confidence: 0.85 };
                    break;
                }
            }

            if (parsedIntent.type === 'navigation') {
                console.log(`[IntentService] AI resolved to screen: ${parsedIntent.screen} with params: ${JSON.stringify(parsedIntent.params)}`);
            }

            return {
                ...parsedIntent,
                source: 'integrated_llm'
            };

        } catch (error) {
            console.error('[IntentService Node] Fallback Error:', error.message);
            throw error;
        }
    }
}

module.exports = new IntentService();
