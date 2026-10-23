import os
import json
import asyncio
import re
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
_model_load_lock = asyncio.Lock()

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


async def _ensure_model_loaded():
    """Load the model once without blocking the async server event loop."""
    if _model is not None or not _model_available:
        return

    async with _model_load_lock:
        if _model is not None or not _model_available:
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _load_model)

async def check_toxicity(text: str):
    """
    Analyzes text for toxicity.
    Flow: Keyword check -> ML model check.
    """
    await _ensure_model_loaded()

    found_keywords = find_keyword_matches(text)
    category_scores = get_category_scores(text)

    if found_keywords:
        return {
            "is_toxic": True,
            "score": 0.95,
            "label": "abusive",
            "source": "keyword_match",
            "highlighted_words": found_keywords,
            "category_scores": category_scores,
            "category_score_source": "phrase_match"
        }

    if not _model_available or _model is None or _tokenizer is None:
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "non_offensive",
            "source": "fallback",
            "highlighted_words": [],
            "category_scores": category_scores,
            "category_score_source": "phrase_match"
        }

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _run_model_inference, text)
        return result
    except Exception as e:
        print(f"Prediction error: {e}")
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "error",
            "source": "error",
            "highlighted_words": [],
            "category_scores": category_scores,
            "category_score_source": "phrase_match"
        }


def _run_model_inference(text: str) -> Dict[str, Any]:
    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = _model(**inputs)
        logits = outputs.logits
        probabilities = torch.softmax(logits, dim=-1)
        prediction = torch.argmax(logits, dim=-1).item()

        is_toxic = prediction != 0
        label = _id2label.get(str(prediction)) or _id2label.get(prediction) or "unknown"
        toxic_index = next(
            (int(index) for index, name in _id2label.items() if str(name).lower() == "toxic"),
            1 if probabilities.shape[1] > 1 else 0,
        )
        toxic_score = float(probabilities[0][toxic_index].item())

        return {
            "is_toxic": bool(is_toxic),
            "score": round(toxic_score, 4),
            "label": label,
            "source": "ml_model",
            "highlighted_words": find_keyword_matches(text),
            "category_scores": get_category_scores(text),
            "category_score_source": "phrase_match"
        }

TOXIC_KEYWORDS = [
    'chutiya', 'chuteya', 'chutia', 'bhenchod', 'behenchod', 'madarchod',
    'motherfucker', 'bastard', 'lund', 'gand', 'kutta', 'kaminey', 'harami',
    'randi', 'mullo', 'katua', 'saala', 'mc', 'bc', 'bkl', 'stupid', 'idiot',
    'hate', 'kill', 'worthless', 'useless', 'go away', 'nobody likes you'
]

_INSULT_TERMS = (
    "chutiya", "chuteya", "chutia", "bhenchod", "behenchod", "madarchod",
    "motherfucker", "bastard", "lund", "gand", "kutta", "kaminey", "harami",
    "randi", "mullo", "katua", "saala", "mc", "bc", "bkl", "stupid", "idiot",
    "worthless", "useless",
)
_HARASSMENT_PHRASES = (
    "go away", "nobody likes you", "shut up", "fuck off", "leave me alone",
    "you are worthless", "you are useless", "you are stupid", "you are an idiot",
)
_THREAT_PATTERNS = (
    re.compile(r"\b(?:i|we)'?ll\s+(?:kill|hurt|beat|attack|find)\s+you\b", re.I),
    re.compile(r"\b(?:i|we)\s+(?:will|am going to|are going to)\s+(?:kill|hurt|beat|attack)\s+you\b", re.I),
    re.compile(r"\byou(?:'| wi)ll regret (?:this|it)\b", re.I),
)


def find_keyword_matches(text: str) -> list[str]:
    """Return exact matched phrases, using word boundaries to avoid substring hits."""
    ordered = sorted(set(TOXIC_KEYWORDS), key=len, reverse=True)
    pattern = re.compile(
        r"(?<!\w)(?:" + "|".join(re.escape(term) for term in ordered) + r")(?!\w)",
        re.I,
    )
    return list(dict.fromkeys(match.group(0) for match in pattern.finditer(text)))


def get_category_scores(text: str) -> dict[str, int]:
    """Rule-based phrase signals, not calibrated probabilities from the binary model."""
    lowered = text.lower()
    insult_hit = bool(find_keyword_matches(text) and any(
        re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", lowered)
        for term in _INSULT_TERMS
    ))
    harassment_hit = any(
        re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", lowered)
        for phrase in _HARASSMENT_PHRASES
    )
    threat_hit = any(pattern.search(text) for pattern in _THREAT_PATTERNS)
    return {
        "insult": 100 if insult_hit else 0,
        "harassment": 100 if harassment_hit else 0,
        "threat": 100 if threat_hit else 0,
    }

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

    await _ensure_model_loaded()

    found_keywords = find_keyword_matches(text)

    sender = await users_collection.find_one({"_id": ObjectId(sender_id)})
    is_friend = sender and receiver_id in sender.get("friends", [])

    context_score = 0.0
    context_label = "non_offensive"
    recent_messages = []
    toxic_history = 0

    if conversation_id:
        recent_messages = await messages_collection.find({
            "conversation_id": conversation_id
        }).sort("created_at", -1).limit(10).to_list(10)

        toxic_history = sum(
            1 for m in recent_messages
            if m.get("is_toxic") and str(m.get("sender_id")) == sender_id
        )
        context_score = min(toxic_history / 10, 1.0)

        if toxic_history >= 5:
            context_label = "suppression_pattern"
        elif toxic_history >= 3:
            context_label = "potential_bullying"

    if found_keywords:
        base_score = 0.85
        final_score = min(base_score + context_score, 1.0)

        return {
            "is_toxic": final_score >= 0.5,
            "score": round(final_score, 4),
            "label": context_label if context_score > 0.5 else "abusive",
            "source": "keyword_match",
            "highlighted_words": found_keywords,
            "category_scores": get_category_scores(text),
            "category_score_source": "phrase_match",
            "context": {
                "is_friend": is_friend,
                "conversation_toxicity": context_score,
                "recent_messages_considered": len(recent_messages),
                "toxic_messages_from_sender": toxic_history,
            },
            "warning": _get_contextual_warning("abusive")
        }

    if not _model_available or _model is None or _tokenizer is None:
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "non_offensive",
            "source": "fallback",
            "highlighted_words": [],
            "category_scores": get_category_scores(text),
            "category_score_source": "phrase_match",
            "context": {
                "is_friend": is_friend,
                "conversation_toxicity": context_score,
                "recent_messages_considered": len(recent_messages),
                "toxic_messages_from_sender": toxic_history,
            },
            "warning": None
        }

    try:
        loop = asyncio.get_running_loop()
        ml_result = await loop.run_in_executor(None, _run_model_inference, text)
        ml_score = ml_result["score"]
        label = ml_result["label"]

        final_score = min(ml_score + context_score, 1.0)
        actually_toxic = final_score >= 0.5

        if actually_toxic and context_score > 0.3:
            label = context_label if context_label != "non_offensive" else ml_result["label"]

        return {
            "is_toxic": actually_toxic,
            "score": round(final_score, 4),
            "label": label,
            "source": "ml_model",
            "highlighted_words": ml_result.get("highlighted_words", []),
            "category_scores": get_category_scores(text),
            "category_score_source": "phrase_match",
            "context": {
                "is_friend": is_friend,
                "conversation_toxicity": context_score,
                "recent_messages_considered": len(recent_messages) if conversation_id else 0,
                "toxic_messages_from_sender": toxic_history if conversation_id else 0,
            },
            "warning": _get_contextual_warning(label) if actually_toxic else None
        }
    except Exception as e:
        print(f"Chat prediction error: {e}")
        return {
            "is_toxic": False,
            "score": 0.0,
            "label": "error",
            "source": "error",
            "highlighted_words": [],
            "category_scores": get_category_scores(text),
            "category_score_source": "phrase_match",
            "context": {"is_friend": is_friend},
            "warning": None
        }

def _get_contextual_warning(label: str) -> str:
    if label in ("hate_speech", "suppression_pattern"):
        return "Harassment detected. This behavior violates community guidelines."
    return "Potentially harmful language detected. Please review your message."
