from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from app.models import get_users_collection, get_posts_collection
from app.middleware.auth_middleware import token_required
import bcrypt
import cloudinary.uploader

bp = Blueprint('users', __name__, url_prefix='/api/users')

@bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user_id):
    try:
        users_collection = get_users_collection()
        user = users_collection.find_one({'_id': ObjectId(current_user_id)})
        
        return jsonify({
            'id': str(user['_id']),
            'name': user['name'],
            'email': user['email'],
            'profile_picture': user['profile_picture'],
            'bio': user.get('bio', ''),
            'followers': len(user.get('followers', [])),
            'following': len(user.get('following', []))
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/profile/<user_id>', methods=['GET'])
@token_required
def get_user_profile(current_user_id, user_id):
    try:
        users_collection = get_users_collection()
        user = users_collection.find_one({'_id': ObjectId(user_id)})
        
        posts_collection = get_posts_collection()
        posts = list(posts_collection.find({'user_id': ObjectId(user_id)}).sort('created_at', -1))
        
        for post in posts:
            post['id'] = str(post['_id'])
            post['likes_count'] = len(post.get('likes', []))
            post['comments_count'] = 0  # You can add comments count here
            del post['_id']
        
        return jsonify({
            'user': {
                'id': str(user['_id']),
                'name': user['name'],
                'profile_picture': user['profile_picture'],
                'bio': user.get('bio', ''),
                'followers': len(user.get('followers', [])),
                'following': len(user.get('following', []))
            },
            'posts': posts,
            'is_following': current_user_id in [str(f) for f in user.get('followers', [])]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/profile/update', methods=['PUT'])
@token_required
def update_profile(current_user_id):
    try:
        data = request.json
        users_collection = get_users_collection()
        update_data = {}
        
        if 'name' in data:
            update_data['name'] = data['name']
        if 'bio' in data:
            update_data['bio'] = data['bio']
        if 'email' in data:
            update_data['email'] = data['email']
        if 'password' in data:
            hashed = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
            update_data['password'] = hashed
        if 'profile_picture' in data and data['profile_picture'].startswith('data:image'):
            upload_result = cloudinary.uploader.upload(data['profile_picture'])
            update_data['profile_picture'] = upload_result['secure_url']
        
        update_data['updated_at'] = datetime.utcnow()
        
        users_collection.update_one(
            {'_id': ObjectId(current_user_id)},
            {'$set': update_data}
        )
        
        return jsonify({'message': 'Profile updated'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<user_id>/follow', methods=['POST'])
@token_required
def follow_user(current_user_id, user_id):
    try:
        users_collection = get_users_collection()
        
        users_collection.update_one(
            {'_id': ObjectId(current_user_id)},
            {'$addToSet': {'following': ObjectId(user_id)}}
        )
        
        users_collection.update_one(
            {'_id': ObjectId(user_id)},
            {'$addToSet': {'followers': ObjectId(current_user_id)}}
        )
        
        return jsonify({'following': True}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<user_id>/unfollow', methods=['POST'])
@token_required
def unfollow_user(current_user_id, user_id):
    try:
        users_collection = get_users_collection()
        
        users_collection.update_one(
            {'_id': ObjectId(current_user_id)},
            {'$pull': {'following': ObjectId(user_id)}}
        )
        
        users_collection.update_one(
            {'_id': ObjectId(user_id)},
            {'$pull': {'followers': ObjectId(current_user_id)}}
        )
        
        return jsonify({'following': False}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/search', methods=['GET'])
@token_required
def search_users(current_user_id):
    try:
        query = request.args.get('q', '')
        users_collection = get_users_collection()
        
        users = list(users_collection.find({
            'name': {'$regex': query, '$options': 'i'},
            '_id': {'$ne': ObjectId(current_user_id)}
        }).limit(10))
        
        result = []
        for user in users:
            result.append({
                'id': str(user['_id']),
                'name': user['name'],
                'profile_picture': user['profile_picture'],
                'bio': user.get('bio', ''),
                'is_following': current_user_id in [str(f) for f in user.get('followers', [])]
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/suggestions', methods=['GET'])
@token_required
def get_suggestions(current_user_id):
    try:
        users_collection = get_users_collection()
        current_user = users_collection.find_one({'_id': ObjectId(current_user_id)})
        following = current_user.get('following', [])
        
        users = list(users_collection.find({
            '_id': {'$nin': [ObjectId(current_user_id)] + following}
        }).limit(5))
        
        result = []
        for user in users:
            result.append({
                'id': str(user['_id']),
                'name': user['name'],
                'profile_picture': user['profile_picture'],
                'bio': user.get('bio', '')
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500