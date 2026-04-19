from flask_socketio import emit, join_room, leave_room
from app import socketio
from bson import ObjectId
from datetime import datetime
from app.models import get_messages_collection, get_conversations_collection

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('join')
def handle_join(data):
    user_id = data['user_id']
    join_room(user_id)

@socketio.on('send_message')
def handle_send_message(data):
    try:
        conversation_id = ObjectId(data['conversation_id'])
        sender_id = data['sender_id']
        receiver_id = data['receiver_id']
        content = data['content']
        
        message = {
            'conversation_id': conversation_id,
            'sender_id': ObjectId(sender_id),
            'receiver_id': ObjectId(receiver_id),
            'content': content,
            'created_at': datetime.utcnow(),
            'read': False
        }
        
        result = get_messages_collection().insert_one(message)
        
        # Update conversation
        get_conversations_collection().update_one(
            {'_id': conversation_id},
            {
                '$set': {'updated_at': datetime.utcnow()},
                '$inc': {f'unread.{receiver_id}': 1}
            }
        )
        
        message_data = {
            'id': str(result.inserted_id),
            'conversation_id': data['conversation_id'],
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'content': content,
            'created_at': message['created_at'].isoformat()
        }
        
        # Emit to both users
        emit('new_message', message_data, room=sender_id)
        emit('new_message', message_data, room=receiver_id)
        emit('message_notification', {
            'from_user_id': sender_id,
            'conversation_id': data['conversation_id'],
            'content': content
        }, room=receiver_id)
        
    except Exception as e:
        print(f"Error sending message: {e}")

@socketio.on('typing')
def handle_typing(data):
    emit('user_typing', {
        'user_id': data['user_id'],
        'conversation_id': data['conversation_id'],
        'is_typing': data['is_typing']
    }, room=data['receiver_id'])