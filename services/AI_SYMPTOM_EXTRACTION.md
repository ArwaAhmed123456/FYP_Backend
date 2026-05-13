# AI-Driven Symptom Extraction System

## Overview

The chatbot backend has been upgraded from a manual synonym dictionary to a dynamic, AI-driven symptom normalization pipeline. This system uses embedding-based similarity matching to detect symptoms from user input in English, Urdu, or mixed language, handling slang, typos, and natural language variations.

## Architecture

### A) Canonical Symptoms List
- **File**: `backend/data/chatbot/canonicalSymptoms.json`
- **Purpose**: Single source of truth for standardized symptom names
- **Format**: Space-separated symptom names (e.g., "abdominal pain", "fever")
- **Count**: 100+ standardized symptoms

### B) Dynamic Symptom Extraction Module
- **File**: `backend/services/utils/symptom_extractor.py`
- **Function**: `detect_symptoms(text, use_ai_fallback=True)`
- **Features**:
  1. Automatic language detection (English/Urdu/Mixed)
  2. Text cleaning and normalization
  3. Embedding-based similarity matching using multilingual model
  4. Cosine similarity threshold (70%)
  5. GPT fallback for ambiguous cases

### C) Embedding Caching
- **File**: `backend/data/chatbot/symptomEmbeddings.json`
- **Purpose**: Precomputed embeddings for canonical symptoms
- **Auto-regeneration**: Automatically regenerates if canonical symptoms change
- **Model**: `paraphrase-multilingual-MiniLM-L12-v2` (supports 50+ languages including Urdu)

### D) GPT Fallback
- **File**: `backend/services/utils/symptom_extractor.py` (function: `map_symptoms_ai`)
- **Purpose**: Handle ambiguous inputs when embedding similarity is low
- **Requires**: `OPENAI_API_KEY` environment variable
- **Model**: GPT-3.5-turbo-instruct

### E) Integration
- **File**: `backend/services/chatbot_service.py`
- **Function**: `extract_symptoms_from_text(user_text)`
- **Flow**:
  1. Try AI-driven extraction (embedding-based)
  2. Map canonical symptoms to old format (underscore-separated) for compatibility
  3. Fallback to pattern matching if AI extraction fails

## Key Features

### ✅ Removed
- Large static `symptom_synonyms` dictionary (150+ entries)
- Manual synonym mapping logic
- Hardcoded symptom variations

### ✅ Added
- Dynamic embedding-based symptom detection
- Automatic language detection
- Multilingual support (English, Urdu, mixed)
- Slang and typo handling
- Embedding caching for performance
- GPT fallback for edge cases
- Modular, maintainable code structure

## Usage

### Basic Usage
```python
from utils.symptom_extractor import detect_symptoms

# English
symptoms = detect_symptoms("my stomach is killing me")
# Returns: ["abdominal pain", "stomach pain"]

# Urdu
symptoms = detect_symptoms("mera pait dard kar raha hai")
# Returns: ["abdominal pain", "stomach pain"]

# Mixed
symptoms = detect_symptoms("mera stomach dard kar raha hai")
# Returns: ["abdominal pain", "stomach pain"]

# Slang/Typos
symptoms = detect_symptoms("my tummy hurts")
# Returns: ["abdominal pain", "stomach pain"]
```

### Integration with Chatbot
The system is automatically integrated into `chatbot_service.py`. The `extract_symptoms_from_text()` function now uses the AI-driven extractor by default, with automatic fallback to pattern matching if needed.

## Installation

### Required Packages
```bash
pip install sentence-transformers>=2.2.0
pip install torch>=2.0.0
pip install openai>=1.0.0
```

### Optional: OpenAI API Key
For GPT fallback functionality, set the environment variable:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

## Testing

### Run Unit Tests
```bash
cd backend/services
python -m pytest tests/test_symptom_extractor.py -v
```

Or run directly:
```bash
cd backend/services
python tests/test_symptom_extractor.py
```

### Test Cases Covered
- ✅ English symptom detection
- ✅ Urdu symptom detection
- ✅ Mixed language detection
- ✅ Slang and typo handling
- ✅ Language detection accuracy

## Performance

- **Embedding Model Loading**: ~2-5 seconds (first time only)
- **Embedding Computation**: ~1-2 seconds (first time, then cached)
- **Symptom Detection**: ~50-200ms per query (after caching)
- **Cache Size**: ~2-5 MB (for 100 symptoms)

## Maintenance

### Adding New Symptoms
1. Add to `backend/data/chatbot/canonicalSymptoms.json`
2. Embeddings will auto-regenerate on next run
3. No code changes needed!

### Adjusting Similarity Threshold
Edit `SIMILARITY_THRESHOLD` in `backend/services/utils/symptom_extractor.py`:
```python
SIMILARITY_THRESHOLD = 0.70  # Default: 70%
```

### Disabling GPT Fallback
Set `use_ai_fallback=False` in `detect_symptoms()` calls, or don't set `OPENAI_API_KEY`.

## Benefits

1. **Scalability**: No need to manually add synonyms
2. **Multilingual**: Supports English, Urdu, and mixed language
3. **Robustness**: Handles slang, typos, and natural language
4. **Maintainability**: Modular, clean code structure
5. **Performance**: Cached embeddings for fast responses
6. **Flexibility**: Easy to adjust thresholds and add symptoms

## Migration Notes

- Old `symptom_synonyms` dictionary has been removed
- `normalize_synonyms()` function has been removed
- `extract_symptoms_from_text()` now uses AI-driven extraction
- Backward compatibility maintained through symptom mapping

## Troubleshooting

### Embeddings Not Loading
- Check if `sentence-transformers` is installed
- Verify `canonicalSymptoms.json` exists
- Check file permissions

### Low Detection Accuracy
- Adjust `SIMILARITY_THRESHOLD` (lower = more matches, higher = stricter)
- Enable GPT fallback with `OPENAI_API_KEY`
- Check if symptoms are in canonical list

### Performance Issues
- Ensure embeddings are cached (check `symptomEmbeddings.json`)
- Use GPU if available (automatic with PyTorch)
- Consider reducing canonical symptoms list size

