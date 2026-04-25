from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import os
import json

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models')

# Lazy load - only load when predict_toxicity is first called
_tokenizer = None
_model = None
_id2label = None

def _load_model():
    global _tokenizer, _model, _id2label
    if _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    if _model is None:
        _model = AutoModelForSequenceClassification.from_pretrained(
            MODEL_PATH,
            low_cpu_mem_usage=True,  # Reduce memory pressure
            torch_dtype=torch.float32
        )
        _model.eval()
    if _id2label is None:
        with open(os.path.join(MODEL_PATH, 'config.json'), 'r') as f:
            config = json.load(f)
        _id2label = config.get('id2label', {})

def predict_toxicity(text):
    """
    Predict if a text is toxic/offensive.

    This model uses the following labels:
    - 0: non_offensive (safe)
    - 1: abusive (toxic)
    - 2: hate_speech (toxic)

    Args:
        text (str): The text to analyze

    Returns:
        dict: {
            'is_toxic': bool,  # True if abusive or hate_speech
            'confidence': float,  # Confidence score for the top prediction
            'prediction': int,  # Predicted class (0, 1, or 2)
            'label': str,  # Human-readable label
            'all_scores': dict  # All class scores
        }
    """
    _load_model()

    # Keyword blacklist for Hindi/Urdu slurs (keyword-based fallback)
    TOXIC_KEYWORDS = [
        # Common Hindi/Urdu profanity
        'chutiya', 'chuteya', 'chutia', 'chamaar', 'bhenchod', 'bhenchodd',
        'behenchod', 'madarchod', 'motherfucker', 'bastard',
        'lund', 'gand', 'kutta', 'kaminey', 'harami', 'suar', 'randi',
        'mullo', 'katua', 'saala', 'kamina', 'haramkhor', 'patla',
        'chup', 'bkl', 'mc', 'bc', 'ml', 'madarc**d', 'bhenc**d',
        # Romanized variants and shorthand
        'madarch**d', 'behenc**d', 'chutiy**', 'kamin**', 'haramkhor**',
        'bhen*cod', 'm*****f***r', 'f***k', 'f**k', 'suar',
        # Religious/caste slurs
        'mullo', 'katua', 'troll', 'hindu', 'muslim', 'sikh', 'christian',
        # Generic hate
        'nazi', 'racist', 'casteist', 'xenophobe'
    ]

    text_lower = text.lower()
    for kw in TOXIC_KEYWORDS:
        if kw in text_lower:
            return {
                'is_toxic': True,
                'confidence': 0.95,
                'prediction': 1,
                'label': 'abusive',
                'all_scores': {'abusive': 0.95, 'non_offensive': 0.05, 'hate_speech': 0.0}
            }

    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    
    with torch.no_grad():
        outputs = _model(**inputs)
        logits = outputs.logits
        probabilities = torch.softmax(logits, dim=-1)
        prediction = torch.argmax(logits, dim=-1).item()
        confidence = probabilities[0][prediction].item()
        
        # Get all class scores
        all_scores = {}
        for class_id, label in _id2label.items():
            class_id = int(class_id)
            all_scores[label] = round(probabilities[0][class_id].item(), 4)
    
    # Determine if toxic (abusive or hate_speech)
    label = _id2label.get(str(prediction), 'unknown')
    is_toxic = prediction != 0  # 0 is non_offensive (safe)
    
    return {
        'is_toxic': is_toxic,
        'confidence': round(confidence, 4),
        'prediction': prediction,
        'label': label,
        'all_scores': all_scores
    }
