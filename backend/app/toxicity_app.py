from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "message": "Toxicity detection service is running"})

@app.route('/detect_comment', methods=['POST'])
def detect_comment():
    """
    Detect if a comment is toxic/offensive.
    
    Expected JSON body:
    {
        "comment": "text to check"
    }
    
    Returns:
    {
        "comment": "original comment",
        "is_toxic": bool,
        "prediction": int (0 or 1),
        "confidence": float,
        "warning": str (if toxic)
    }
    """
    from app.ml import predict_toxicity, MODEL_PATH
    
    data = request.get_json()
    comment = data.get('comment', '').strip()

    if not comment:
        return jsonify({"error": "No comment provided"}), 400

    # Run toxicity detection
    result = predict_toxicity(comment)

    response = {
        "comment": comment,
        "is_toxic": result['is_toxic'],
        "prediction": result['prediction'],
        "label": result['label'],
        "confidence": result['confidence'],
        "all_scores": result['all_scores']
    }
    
    # Add warning if toxic
    if result['is_toxic']:
        response["warning"] = f"This comment appears to be {result['label'].replace('_', ' ').title()}. Please edit or delete it."

    return jsonify(response), 200

if __name__ == '__main__':
    print("✅ Toxic detection model loaded!")
    print(f"📍 Model path: {MODEL_PATH}")
    app.run(host='0.0.0.0', port=5000, debug=True)