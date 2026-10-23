from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from ..services.websocket_manager import manager
from ..services.moderation_service import check_chat_toxicity
from jose import jwt, JWTError
from ..config import settings
from ..database import users_collection, messages_collection, conversations_collection
from ..services.user_behaviour_service import is_muted, record_violation
from bson import ObjectId
from datetime import datetime
import json

router = APIRouter(tags=["WebSockets"])

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


async def get_conversation_peer(conversation_id: str, user_id: str, requested_peer_id: str = None):
    """Return the other participant only when the authenticated user belongs to this chat."""
    if not ObjectId.is_valid(conversation_id):
        return None

    conversation = await conversations_collection.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        return None

    participants = [str(participant) for participant in conversation.get("participants", [])]
    if user_id not in participants:
        return None

    peers = [participant for participant in participants if participant != user_id]
    if len(peers) != 1 or not ObjectId.is_valid(peers[0]):
        return None

    peer_id = peers[0]
    if requested_peer_id is not None and str(requested_peer_id) != peer_id:
        return None
    return peer_id


async def send_socket_error(user_id: str, code: str, message: str, client_message_id: str = None):
    payload = {
        "type": "message_error",
        "code": code,
        "message": message,
    }
    if client_message_id:
        payload["client_message_id"] = client_message_id
    await manager.send_personal_message(payload, user_id)

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
                client_message_id = data.get("client_message_id")
                if not isinstance(client_message_id, str) or len(client_message_id) > 100:
                    client_message_id = None

                if await is_muted(user_id):
                    await send_socket_error(user_id, "account_muted", "Your account is muted. Check your behaviour page for the mute end time.", client_message_id)
                    continue

                conversation_id = data.get("conversation_id")
                content = data.get("content")
                if not isinstance(content, str) or not content.strip():
                    await send_socket_error(user_id, "empty_message", "Write a message before sending.", client_message_id)
                    continue

                content = content.strip()
                if len(content) > 5000:
                    await send_socket_error(user_id, "message_too_long", "Messages must be 5,000 characters or fewer.", client_message_id)
                    continue

                claimed_sender_id = data.get("sender_id")
                if claimed_sender_id is not None and str(claimed_sender_id) != user_id:
                    await send_socket_error(user_id, "sender_mismatch", "The sender does not match your signed-in account.", client_message_id)
                    continue

                conversation_id = str(conversation_id or "")
                receiver_id = await get_conversation_peer(
                    conversation_id,
                    user_id,
                    data.get("receiver_id"),
                )
                if not receiver_id:
                    await send_socket_error(user_id, "invalid_conversation", "You can only send messages in your own conversations.", client_message_id)
                    continue

                moderation_result = await check_chat_toxicity(
                    content, user_id, receiver_id, conversation_id
                )
                is_toxic = bool(moderation_result.get("is_toxic"))
                user_override = data.get("ignore_warning") is True
                moderation_status = (
                    "flagged" if is_toxic else
                    "unavailable" if moderation_result.get("source") in {"fallback", "error"} else
                    "clear"
                )

                behaviour = None
                if is_toxic:
                    behaviour = await record_violation(user_id, moderation_result.get("score", 0.0))

                # Keep a minimal moderation event for blocked attempts so repeated targeting
                # can be detected without retaining the blocked message text in chat history.
                if is_toxic and (not user_override or (behaviour and behaviour.get("warning_count", 0) >= 3)):
                    await messages_collection.insert_one({
                        "conversation_id": conversation_id,
                        "sender_id": user_id,
                        "is_toxic": True,
                        "toxicity_score": moderation_result.get("score"),
                        "moderation_label": moderation_result.get("label"),
                        "moderation_source": moderation_result.get("source"),
                        "delivery_status": "blocked",
                        "user_override": False,
                        "created_at": datetime.utcnow(),
                    })
                    if behaviour and behaviour.get("warning_count", 0) >= 3:
                        warning_count = behaviour.get("warning_count", 0)
                        message = (
                            "Third community guideline warning. Your account is muted for 24 hours."
                            if warning_count == 3 else
                            f"Further violation recorded. Your account is muted again for 24 hours (warning {warning_count})."
                        )
                        await send_socket_error(user_id, "account_muted", message, client_message_id)
                        continue
                    await manager.send_personal_message({
                        "type": "toxicity_warning",
                        "message": f"This may be harmful. Warning {behaviour.get('warning_count', 1)} of 3. Edit it, or choose to send it anyway.",
                        "original_content": content,
                        "client_message_id": client_message_id,
                        "toxicity_score": moderation_result.get("score"),
                        "label": moderation_result.get("label"),
                        "highlighted_words": moderation_result.get("highlighted_words", []),
                        "category_scores": moderation_result.get("category_scores", {}),
                        "context": moderation_result.get("context", {}),
                    }, user_id)
                    continue
                
                msg = {
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "content": content,
                    "created_at": datetime.utcnow(),
                    "is_read": False,
                    "is_toxic": is_toxic,
                    "toxicity_score": moderation_result.get("score"),
                    "moderation_label": moderation_result.get("label"),
                    "moderation_source": moderation_result.get("source"),
                    "moderation_status": moderation_status,
                    "delivery_status": "delivered",
                    "user_override": is_toxic and user_override,
                    "client_message_id": client_message_id,
                }
                result = await messages_collection.insert_one(msg)
                
                payload = {
                    "type": "new_message",
                    "id": str(result.inserted_id),
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "content": content,
                    "created_at": msg["created_at"].isoformat() + "Z", # Fix frontend parsing correctly
                    "is_toxic": is_toxic,
                    "toxicity_score": moderation_result.get("score"),
                    "moderation_label": moderation_result.get("label"),
                    "moderation_status": moderation_status,
                    "user_override": is_toxic and user_override,
                    "client_message_id": client_message_id,
                }
                
                await manager.send_personal_message(payload, user_id)
                await manager.send_personal_message(payload, receiver_id)
                continue

            if event_type == "typing":
                is_typing = data.get("is_typing")
                conversation_id = str(data.get("conversation_id") or "")
                receiver_id = await get_conversation_peer(
                    conversation_id,
                    user_id,
                    data.get("receiver_id"),
                )
                if not receiver_id:
                    continue
                await manager.send_personal_message({
                    "type": "user_typing",
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "is_typing": is_typing,
                }, receiver_id)
                continue

            await websocket.send_json({"type": "pong", "data": raw})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
