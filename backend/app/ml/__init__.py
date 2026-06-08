import os
import time

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Global caches (loaded once, reused across requests)
_tokenizer = None
_model = None
_device = torch.device("cpu")


def _load_model_and_tokenizer():
    """Load tokenizer + model once (CPU)."""
    global _tokenizer, _model

    if _tokenizer is not None and _model is not None:
        return

    model_dir = os.path.join(os.path.dirname(__file__), "../models")
    if not os.path.exists(model_dir):
        raise FileNotFoundError(f"Model not found at {model_dir}")

    _tokenizer = AutoTokenizer.from_pretrained(model_dir)
    _model = AutoModelForSequenceClassification.from_pretrained(
        model_dir,
        torch_dtype=torch.float32,
    )
    _model.to(_device)
    _model.eval()

    print(f"✅ Model loaded successfully from {model_dir}")


def _predict_proba(text: str) -> torch.Tensor:
    """Return class probabilities tensor on CPU: shape [num_classes]."""
    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=128,
    )

    with torch.no_grad():
        inputs = {k: v.to(_device) for k, v in inputs.items()}
        logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]

    return probs


def _load_id2label():
    """Load label mapping to avoid guessing LABEL_0 vs LABEL_1 semantics."""
    labels_path = os.path.join(os.path.dirname(__file__), "../models/label_config.json")
    import json

    with open(labels_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    # id2label: {"0": "non_offensive", "1": "abusive", ...}
    return cfg.get("id2label", {}), cfg


def predict_toxicity(text: str, threshold: float = 0.40):
    start_time = time.time()

    if not text or not isinstance(text, str) or len(text.strip()) < 2:
        return {
            "is_toxic": False,
            "confidence": 0.0,
            "prediction": "safe",
            "label": "Non-Toxic",
            "latency_ms": 0,
        }

    text = text.strip()
    text_lower = text.lower()

    # Fast keyword ground-truth (no model call)
    strong_toxic_keywords = [
        "fuck",
        "bitch",
        "cunt",
        "whore",
        "slut",
        "randi",
        "madarchod",
        "behenchod",
        "chutiya",
        "gaon*",  # keep loose if user uses variants
        "gaand",
        "mc",
        "bc",
        "rape",
        "kill you",
    ]

    # simple substring match; you can add more exact variants as needed
    if any(kw.replace("*", "") in text_lower for kw in strong_toxic_keywords):
        toxic_prob = 0.97
        return {
            "is_toxic": True,
            "confidence": toxic_prob,
            "prediction": "toxic",
            "label": "Toxic",
            "reason": "keyword",
            "latency_ms": round((time.time() - start_time) * 1000, 2),
        }

    # Transformer inference
    _load_model_and_tokenizer()
    probs = _predict_proba(text)

    id2label, cfg = _load_id2label()

    # Determine toxic probability as P(abusive) + P(hate_speech)
    # Based on label_config.json mapping.
    non_off_id = int(cfg["label2id"]["non_offensive"])
    abusive_id = int(cfg["label2id"]["abusive"])
    hate_id = int(cfg["label2id"].get("hate_speech", 2))

    toxic_prob = (probs[abusive_id] + probs[hate_id]).item()
    is_toxic = toxic_prob >= threshold

    return {
        "is_toxic": bool(is_toxic),
        "confidence": round(float(toxic_prob), 4),
        "prediction": "toxic" if is_toxic else "safe",
        "label": "Toxic" if is_toxic else "Non-Toxic",
        "latency_ms": round((time.time() - start_time) * 1000, 2),
    }

