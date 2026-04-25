from flask import Blueprint, request, jsonify
from app.middleware.auth_middleware import token_required

bp = Blueprint('toxicity', __name__, url_prefix='/api/toxicity')

@bp.route('/check', methods=['POST'])
@token_required
def check_comment(current_user_id):
    try:
        from app.ml import predict_toxicity
        
        data = request.json
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        result = predict_toxicity(text)
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500