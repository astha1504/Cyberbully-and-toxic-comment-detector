from flask import Blueprint, request, jsonify
import bcrypt
import jwt
import os
from datetime import datetime, timedelta
from bson import ObjectId
from app.models import get_users_collection
from app.middleware.auth_middleware import token_required

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        users_collection = get_users_collection()
        
        existing_user = users_collection.find_one({'email': data['email']})
        if existing_user:
            return jsonify({'error': 'Email already exists'}), 400
        
        hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
        
        user = {
            'name': data['name'],
            'email': data['email'],
            'password': hashed_password,
            'profile_picture': f"https://ui-avatars.com/api/?name={data['name'][0]}&background=random",
            'bio': '',
            'followers': [],
            'following': [],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        result = users_collection.insert_one(user)
        
        token = jwt.encode({
            'user_id': str(result.inserted_id),
            'exp': datetime.utcnow() + timedelta(days=7)
        }, os.getenv('JWT_SECRET'), algorithm='HS256')
        
        return jsonify({
            'token': token,
            'user': {
                'id': str(result.inserted_id),
                'name': user['name'],
                'email': user['email'],
                'profile_picture': user['profile_picture'],
                'bio': user['bio']
            }
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.json
        users_collection = get_users_collection()
        
        user = users_collection.find_one({'email': data['email']})
        
        if not user or not bcrypt.checkpw(data['password'].encode('utf-8'), user['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        token = jwt.encode({
            'user_id': str(user['_id']),
            'exp': datetime.utcnow() + timedelta(days=7)
        }, os.getenv('JWT_SECRET'), algorithm='HS256')
        
        return jsonify({
            'token': token,
            'user': {
                'id': str(user['_id']),
                'name': user['name'],
                'email': user['email'],
                'profile_picture': user['profile_picture'],
                'bio': user.get('bio', ''),
                'followers': len(user.get('followers', [])),
                'following': len(user.get('following', []))
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/verify', methods=['GET'])
@token_required
def verify(current_user_id):
    users_collection = get_users_collection()
    user = users_collection.find_one({'_id': ObjectId(current_user_id)})
    
    return jsonify({
        'id': str(user['_id']),
        'name': user['name'],
        'email': user['email'],
        'profile_picture': user['profile_picture'],
        'bio': user.get('bio', '')
    }), 200