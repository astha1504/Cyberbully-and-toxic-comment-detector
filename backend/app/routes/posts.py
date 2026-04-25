from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from app.models import get_posts_collection, get_comments_collection, get_users_collection
from app.middleware.auth_middleware import token_required
import cloudinary
import cloudinary.uploader
import os

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

bp = Blueprint('posts', __name__, url_prefix='/api/posts')

@bp.route('/', methods=['POST'])
@token_required
def create_post(current_user_id):
    try:
        data = request.json
        images = data.get('images', [])
        uploaded_images = []
        
        for image in images:
            if image.startswith('data:image'):
                upload_result = cloudinary.uploader.upload(image)
                uploaded_images.append(upload_result['secure_url'])
        
        post = {
            'user_id': ObjectId(current_user_id),
            'caption': data.get('caption', ''),
            'images': uploaded_images,
            'likes': [],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        result = get_posts_collection().insert_one(post)
        
        return jsonify({
            'id': str(result.inserted_id),
            'caption': post['caption'],
            'images': post['images'],
            'likes': [],
            'created_at': post['created_at'].isoformat()
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/', methods=['GET'])
@token_required
def get_posts(current_user_id):
    try:
        users_collection = get_users_collection()
        current_user = users_collection.find_one({'_id': ObjectId(current_user_id)})
        following = current_user.get('following', [])
        
        posts_collection = get_posts_collection()
        posts = list(posts_collection.find({
            '$or': [
                {'user_id': ObjectId(current_user_id)},
                {'user_id': {'$in': following}}
            ]
        }).sort('created_at', -1).limit(50))
        
        for post in posts:
            post['id'] = str(post['_id'])
            post['user_id'] = str(post['user_id'])
            post['likes'] = [str(like) for like in post.get('likes', [])]
            post['is_liked'] = current_user_id in post['likes']
            
            user = users_collection.find_one({'_id': ObjectId(post['user_id'])})
            post['user'] = {
                'id': str(user['_id']),
                'name': user['name'],
                'profile_picture': user['profile_picture']
            }
            
            comments_count = get_comments_collection().count_documents({'post_id': ObjectId(post['_id'])})
            post['comments_count'] = comments_count
            
            del post['_id']
        
        return jsonify(posts), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<post_id>/like', methods=['POST'])
@token_required
def like_post(current_user_id, post_id):
    try:
        posts_collection = get_posts_collection()
        post = posts_collection.find_one({'_id': ObjectId(post_id)})
        
        if current_user_id in [str(like) for like in post.get('likes', [])]:
            posts_collection.update_one(
                {'_id': ObjectId(post_id)},
                {'$pull': {'likes': ObjectId(current_user_id)}}
            )
            liked = False
        else:
            posts_collection.update_one(
                {'_id': ObjectId(post_id)},
                {'$push': {'likes': ObjectId(current_user_id)}}
            )
            liked = True
        
        return jsonify({'liked': liked}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<post_id>', methods=['DELETE'])
@token_required
def delete_post(current_user_id, post_id):
    try:
        posts_collection = get_posts_collection()
        post = posts_collection.find_one({'_id': ObjectId(post_id)})
        
        if str(post['user_id']) != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        get_comments_collection().delete_many({'post_id': ObjectId(post_id)})
        posts_collection.delete_one({'_id': ObjectId(post_id)})
        
        return jsonify({'message': 'Post deleted'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<post_id>/comments', methods=['POST'])
@token_required
def add_comment(current_user_id, post_id):
    try:
        data = request.json
        users_collection = get_users_collection()
        user = users_collection.find_one({'_id': ObjectId(current_user_id)})
        
        comment_content = data['content']
        
        from app.ml import predict_toxicity
        toxicity_result = predict_toxicity(comment_content)
        
        if toxicity_result['is_toxic']:
            return jsonify({
                'error': 'Your comment was flagged as potentially toxic. Please revise your comment.',
                'is_toxic': True,
                'warning': 'This comment may be considered toxic. Please be respectful.',
                'confidence': toxicity_result['confidence']
            }), 400
        
        comment = {
            'post_id': ObjectId(post_id),
            'user_id': ObjectId(current_user_id),
            'user_name': user['name'],
            'user_profile_picture': user['profile_picture'],
            'content': comment_content,
            'created_at': datetime.utcnow()
        }
        
        result = get_comments_collection().insert_one(comment)
        
        return jsonify({
            'id': str(result.inserted_id),
            'user_name': comment['user_name'],
            'user_profile_picture': comment['user_profile_picture'],
            'content': comment['content'],
            'created_at': comment['created_at'].isoformat(),
            'post_id': str(comment['post_id']),
            'user_id': str(comment['user_id']),
            'is_toxic': False
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<post_id>/comments', methods=['GET'])
@token_required
def get_comments(current_user_id, post_id):
    try:
        comments = list(get_comments_collection().find({'post_id': ObjectId(post_id)}).sort('created_at', -1))
        
        for comment in comments:
            comment['id'] = str(comment['_id'])
            comment['user_id'] = str(comment['user_id'])
            comment['post_id'] = str(comment['post_id'])
            comment['created_at'] = comment['created_at'].isoformat()
            del comment['_id']
        
        return jsonify(comments), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/comments/<comment_id>', methods=['DELETE'])
@token_required
def delete_comment(current_user_id, comment_id):
    try:
        comment = get_comments_collection().find_one({'_id': ObjectId(comment_id)})
        
        if str(comment['user_id']) != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        get_comments_collection().delete_one({'_id': ObjectId(comment_id)})
        
        return jsonify({'message': 'Comment deleted'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500