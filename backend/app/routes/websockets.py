from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from ..services.websocket_manager import manager
from ..services.moderation_service import check_chat_toxicity
from jose import jwt, JWTError
from ..config import settings
from ..database import users_collection, messages_collection, conversations_collection
from bson import ObjectId
from datetime import datetime
import json

router = APIRouter(tags=["WebSockets"])

# Cache to store bypassed warnings: (sender_id, receiver_id, content)
_toxicity_warning_bypassed = set()

async def get_user_from_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = await users_collection.find_one({"username": username})
        return user
    except JWTError:
        return None

@router.websocket("/ws/notifications")
async def websocket_endpoint(
    websocket: WebSocket, 
    token: str = Query(...)
):
    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=1008) # Policy Violation
        return

    user_id = str(user["_id"])
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                await websocket.send_json({"type": "pong", "data": raw})
                continue

            event_type = data.get("event") or data.get("type")

            if event_type == "send_message":
                conversation_id = data.get("conversation_id")
                sender_id = data.get("sender_id")
                receiver_id = data.get("receiver_id")
                content = data.get("content")
                if not conversation_id or not sender_id or not receiver_id or not content:
                    continue
                
                # Feature 2: Friend check and toxicity detection
                sender_doc = await users_collection.find_one({"_id": ObjectId(sender_id)})
                is_friend = False
                if sender_doc and "friends" in sender_doc:
                    is_friend = receiver_id in sender_doc.get("friends", [])

                ignore_warning = data.get("ignore_warning", False)

                if not is_friend and not ignore_warning:
                    moderation_result = await check_chat_toxicity(
                        content, sender_id, receiver_id, conversation_id
                    )
                    if moderation_result.get("is_toxic"):
                        warning_msg = {
                            "type": "toxicity_warning",
                            "message": "Warning: This message may contain abusive language. Please reconsider before sending.",
                            "original_content": content,
                            "toxicity_score": moderation_result.get("score"),
                            "label": moderation_result.get("label"),
                        }
                        await manager.send_personal_message(warning_msg, sender_id)
                        continue
                
                msg = {
                    "conversation_id": conversation_id,
                    "sender_id": sender_id,
                    "content": content,
                    "created_at": datetime.utcnow(),
                    "is_read": False,
                    "is_toxic": False,
                }
                result = await messages_collection.insert_one(msg)
                msg["_id"] = result.inserted_id
                
                payload = {
                    "type": "new_message",
                    "id": str(result.inserted_id),
                    "conversation_id": conversation_id,
                    "sender_id": sender_id,
                    "content": content,
                    "created_at": msg["created_at"].isoformat() + "Z", # Fix frontend parsing correctly
                }
                
                await manager.send_personal_message(payload, sender_id)
                if sender_id != receiver_id:
                    await manager.send_personal_message(payload, receiver_id)
                continue

            if event_type == "typing":
                receiver_id = data.get("receiver_id")
                is_typing = data.get("is_typing")
                conversation_id = data.get("conversation_id")
                if not receiver_id:
                    continue
                await manager.send_personal_message({
                    "type": "user_typing",
                    "user_id": data.get("user_id"),
                    "conversation_id": conversation_id,
                    "is_typing": is_typing,
                }, receiver_id)
                continue

            await websocket.send_json({"type": "pong", "data": raw})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
