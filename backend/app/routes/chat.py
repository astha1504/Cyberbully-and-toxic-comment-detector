from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from ..database import users_collection, conversations_collection, messages_collection
from ..routes.auth import get_current_user

router = APIRouter(prefix="/chat", tags=["Chat"])

async def get_conversation_or_404(conv_id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(conv_id):
        raise HTTPException(status_code=400, detail="Invalid conversation ID")
    conv = await conversations_collection.find_one({"_id": ObjectId(conv_id), "participants": str(current_user["_id"])})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    convs = await conversations_collection.find({"participants": user_id}).to_list(100)
    result = []
    for conv in convs:
        other_id = [p for p in conv["participants"] if p != user_id]
        if not other_id:
            continue
        other_id = other_id[0]
        other_user = await users_collection.find_one({"_id": ObjectId(other_id)})
        if not other_user:
            continue
        last_msg = await messages_collection.find({"conversation_id": str(conv["_id"])}).sort("created_at", -1).limit(1).to_list(1)
        unread_count = await messages_collection.count_documents({"conversation_id": str(conv["_id"]), "sender_id": {"$ne": user_id}, "is_read": False})
        result.append({
            "id": str(conv["_id"]),
            "user": {
                "id": str(other_user["_id"]),
                "username": other_user.get("username"),
                "profile_picture": other_user.get("profile_picture"),
            },
            "last_message": last_msg[0]["content"] if last_msg else "",
            "last_message_time": last_msg[0]["created_at"].isoformat() if last_msg else "",
            "unread_count": unread_count,
        })
    result.sort(key=lambda x: x["last_message_time"], reverse=True)
    return result

@router.get("/messages/{conv_id}")
async def get_messages(conv_id: str, conv = Depends(get_conversation_or_404)):
    msgs = await messages_collection.find({"conversation_id": conv_id}).sort("created_at", 1).to_list(1000)
    return [{**{k: v for k, v in m.items() if k != "_id"}, "id": str(m["_id"])} for m in msgs]

@router.post("/conversation")
async def create_conversation(data: dict, current_user: dict = Depends(get_current_user)):
    other_user_id = data.get("user_id")
    if not other_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    other = await users_collection.find_one({"_id": ObjectId(other_user_id)})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = str(current_user["_id"])
    conv = await conversations_collection.find_one({
        "participants": {"$all": [user_id, other_user_id], "$size": 2}
    })
    if conv:
        return {"id": str(conv["_id"])}
    new_conv = await conversations_collection.insert_one({
        "participants": [user_id, other_user_id],
    })
    return {"id": str(new_conv.inserted_id)}
