from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from app.models import get_messages_collection, get_conversations_collection, get_users_collection
from app.middleware.auth_middleware import token_required

bp = Blueprint('chat', __name__, url_prefix='/api/chat')

@bp.route('/conversations', methods=['GET'])
@token_required
def get_conversations(current_user_id):
    try:
        conversations = list(get_conversations_collection().find({
            'participants': ObjectId(current_user_id)
        }).sort('updated_at', -1))
        
        result = []
        for conv in conversations:
            other_user_id = None
            for pid in conv['participants']:
                if str(pid) != current_user_id:
                    other_user_id = str(pid)
                    break
            
            if other_user_id:
                user = get_users_collection().find_one({'_id': ObjectId(other_user_id)})
                
                last_message = get_messages_collection().find_one(
                    {'conversation_id': conv['_id']},
                    sort=[('created_at', -1)]
                )
                
                result.append({
                    'id': str(conv['_id']),
                    'user': {
                        'id': other_user_id,
                        'name': user['name'],
                        'profile_picture': user['profile_picture']
                    },
                    'last_message': last_message['content'] if last_message else '',
                    'last_message_time': last_message['created_at'].isoformat() if last_message else '',
                    'unread_count': conv.get('unread', {}).get(current_user_id, 0)
                })
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/messages/<conversation_id>', methods=['GET'])
@token_required
def get_messages(current_user_id, conversation_id):
    try:
        messages = list(get_messages_collection().find({
            'conversation_id': ObjectId(conversation_id)
        }).sort('created_at', 1))
        
        for msg in messages:
            msg['id'] = str(msg['_id'])
            msg['created_at'] = msg['created_at'].isoformat()
            msg['sender_id'] = str(msg['sender_id'])
            del msg['_id']
        
        # Mark messages as read
        get_conversations_collection().update_one(
            {'_id': ObjectId(conversation_id)},
            {'$set': {f'unread.{current_user_id}': 0}}
        )
        
        return jsonify(messages), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/conversation', methods=['POST'])
@token_required
def create_conversation(current_user_id):
    try:
        data = request.json
        other_user_id = data['user_id']
        
        existing = get_conversations_collection().find_one({
            'participants': {'$all': [ObjectId(current_user_id), ObjectId(other_user_id)]}
        })
        
        if existing:
            return jsonify({'id': str(existing['_id'])}), 200
        
        conversation = {
            'participants': [ObjectId(current_user_id), ObjectId(other_user_id)],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'unread': {}
        }
        
        result = get_conversations_collection().insert_one(conversation)
        
        return jsonify({'id': str(result.inserted_id)}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500