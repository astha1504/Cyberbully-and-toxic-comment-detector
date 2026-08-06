import os
import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoConfig
from ..config import settings
from ..database import users_collection, messages_collection
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Path to the model files (backend/model)
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'model')

# Lazy load helpers
_tokenizer = None
_model = None
_id2label = None
_model_available = True

def _load_model():
    global _tokenizer, _model, _id2label, _model_available
    
    weight_files = [
        os.path.join(MODEL_PATH, 'pytorch_model.bin'),
        os.path.join(MODEL_PATH, 'model.safetensors'),
        os.path.join(MODEL_PATH, 'pytorch_model_quantized.bin')
    ]
    has_weights = any(os.path.exists(p) for p in weight_files)
    quantized_path = os.path.join(MODEL_PATH, 'pytorch_model_quantized.bin')
    use_quantized = os.path.exists(quantized_path)
    
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
            if use_quantized:
                config = AutoConfig.from_pretrained(MODEL_PATH)
                _model = AutoModelForSequenceClassification.from_config(config)
                _model = torch.quantization.quantize_dynamic(
                    _model, {torch.nn.Linear}, dtype=torch.qint8
                )
                state_dict = torch.load(quantized_path, map_location="cpu")
                _model.load_state_dict(state_dict, strict=False)
            else:
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
            _id2label = {0: "non_offensive", 1: "toxic"}

async def check_toxicity(text: str):
    """
    Analyzes text for toxicity.
    Flow: Keyword check -> ML model check.
    """
    _load_model()
    
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
            
            is_toxic = prediction != 0
            label = _id2label.get(str(prediction)) or _id2label.get(prediction) or "unknown"
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

TOXIC_KEYWORDS = [
    'chutiya', 'chuteya', 'chutia', 'bhenchod', 'behenchod', 'madarchod',
    'motherfucker', 'bastard', 'lund', 'gand', 'kutta', 'kaminey', 'harami',
    'randi', 'mullo', 'katua', 'saala', 'mc', 'bc', 'bkl', 'stupid', 'idiot',
    'hate', 'kill', 'worthless', 'useless', 'go away', 'nobody likes you'
]

async def check_chat_toxicity(
    text: str,
    sender_id: str,
    receiver_id: str,
    conversation_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Context-aware toxicity check for chat messages.
    Considers friendship status, conversation history, and toxicity patterns.
    """
    from bson import ObjectId
    
    _load_model()
    
    text_lower = text.lower()
    found_keywords = [kw for kw in TOXIC_KEYWORDS if kw in text_lower]
    
    sender = await users_collection.find_one({"_id": ObjectId(sender_id)})
    is_friend = sender and receiver_id in sender.get("friends", [])
    
    context_score = 0.0
    context_label = "non_offensive"
    
    if conversation_id:
        recent_messages = await messages_collection.find({
            "conversation_id": conversation_id
        }).sort("created_at", -1).limit(10).to_list(10)
        
        toxic_history = sum(1 for m in recent_messages if m.get("is_toxic"))
        context_score = min(toxic_history / 10, 1.0)
        
        if toxic_history >= 5:
            context_label = "suppression_pattern"
        elif toxic_history >= 3:
            context_label = "potential_bullying"
    
    if found_keywords:
        base_score = 0.85
        threshold = 0.7 if is_friend else 0.5
        final_score = min(base_score + context_score, 1.0)
        
        return {
            "is_toxic": final_score >= threshold,
            "score": round(final_score, 4),
            "label": context_label if context_score > 0.5 else "abusive",
            "source": "keyword_match",
            "context": {
                "is_friend": is_friend,
                "friendship_score": 0.2 if is_friend else 0.0
            },
            "warning": _get_contextual_warning(is_friend, "abusive")
        }
    
    if not _model_available or _model is None or _tokenizer is None:
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "non_offensive",
            "source": "fallback",
            "context": {"is_friend": is_friend},
            "warning": None
        }
    
    try:
        inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = _model(**inputs)
            logits = outputs.logits
            probabilities = torch.softmax(logits, dim=-1)
            prediction = torch.argmax(logits, dim=-1).item()
            
            is_toxic = prediction != 0
            label = _id2label.get(str(prediction)) or _id2label.get(prediction) or "unknown"
            
            ml_score = float(probabilities[0][1].item()) + (float(probabilities[0][2].item()) if probabilities.shape[1] > 2 else 0)
            friendship_modifier = 0.2 if is_friend else 0.0
            final_score = min(ml_score + context_score - friendship_modifier, 1.0)
            
            threshold = 0.6 if is_friend else 0.4
            actually_toxic = final_score >= threshold
            
            if actually_toxic and context_score > 0.3:
                label = context_label if context_label != "non_offensive" else label
            
            return {
                "is_toxic": actually_toxic,
                "score": round(final_score, 4),
                "label": label,
                "source": "ml_model",
                "context": {
                    "is_friend": is_friend,
                    "conversation_toxicity": context_score,
                    "friendship_modifier": friendship_modifier
                },
                "warning": _get_contextual_warning(is_friend, label) if actually_toxic else None
            }
    except Exception as e:
        print(f"Chat prediction error: {e}")
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "error",
            "source": "error",
            "context": {"is_friend": is_friend},
            "warning": None
        }

def _get_contextual_warning(is_friend: bool, label: str) -> str:
    if is_friend:
        return "Friendly teasing detected. Keep it respectful."
    if label in ("hate_speech", "suppression_pattern"):
        return "Harassment detected. This behavior violates community guidelines."
    return "Potentially harmful language detected. Please review your message."
