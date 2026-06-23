import os
import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from ..config import settings

# Path to the model files (backend/model)
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'model')

# Lazy load helpers
_tokenizer = None
_model = None
_id2label = None
_model_available = True

def _load_model():
    global _tokenizer, _model, _id2label, _model_available
    
    # Check if weights exist
    has_weights = os.path.exists(os.path.join(MODEL_PATH, 'pytorch_model.bin')) or \
                  os.path.exists(os.path.join(MODEL_PATH, 'model.safetensors'))
    
    if not has_weights:
        print(f"Warning: Model weights not found at {MODEL_PATH}")
        _model_available = False
        return

    if _tokenizer is None:
        try:
            _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        except Exception as e:
            print(f"Error loading tokenizer: {e}")
            _model_available = False
            return
            
    if _model is None:
        try:
            _model = AutoModelForSequenceClassification.from_pretrained(
                MODEL_PATH,
                torch_dtype=torch.float32
            )
            _model.eval()
        except Exception as e:
            print(f"Error loading model: {e}")
            _model_available = False
            return
            
    if _id2label is None:
        try:
            with open(os.path.join(MODEL_PATH, 'config.json'), 'r') as f:
                config = json.load(f)
            _id2label = config.get('id2label', {})
        except Exception:
            _id2label = {0: "non_offensive", 1: "abusive", 2: "hate_speech"}

async def check_toxicity(text: str):
    """
    Analyzes text for toxicity.
    Flow: Keyword check -> ML model check.
    """
    _load_model()
    
    # Keyword list (Common Hinglish/English slurs from the user's provided code)
    TOXIC_KEYWORDS = [
        'chutiya', 'chuteya', 'chutia', 'bhenchod', 'behenchod', 'madarchod', 
        'motherfucker', 'bastard', 'lund', 'gand', 'kutta', 'kaminey', 'harami', 
        'randi', 'mullo', 'katua', 'saala', 'mc', 'bc', 'bkl'
    ]
    
    text_lower = text.lower()
    found_keywords = [kw for kw in TOXIC_KEYWORDS if kw in text_lower]
    
    if found_keywords:
        return {
            "is_toxic": True,
            "score": 0.95,
            "label": "abusive",
            "source": "keyword_match"
        }
    
    if not _model_available or _model is None or _tokenizer is None:
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "non_offensive",
            "source": "fallback"
        }
        
    try:
        inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = _model(**inputs)
            logits = outputs.logits
            probabilities = torch.softmax(logits, dim=-1)
            prediction = torch.argmax(logits, dim=-1).item()
            
            # Assuming labels: 0=Safe, 1=Abusive, 2=Hate
            is_toxic = prediction != 0
            
            # Map back to labels
            label = _id2label.get(str(prediction)) or _id2label.get(prediction) or "unknown"
            
            # Combined toxic score (Abusive + Hate)
            # probabilities is [1, num_labels]
            toxic_score = float(probabilities[0][1].item()) + (float(probabilities[0][2].item()) if probabilities.shape[1] > 2 else 0)
            
            return {
                "is_toxic": bool(is_toxic),
                "score": round(toxic_score, 4),
                "label": label,
                "source": "ml_model"
            }
    except Exception as e:
        print(f"Prediction error: {e}")
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "error",
            "source": "error"
        }
