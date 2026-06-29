from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from ..database import notifications_collection
from ..models.social import NotificationResponse
from ..routes.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await notifications_collection.find({"user_id": str(current_user["_id"])}).sort("created_at", -1).to_list(100)
    return [{**{k: v for k, v in n.items() if k != "_id"}, "id": str(n.get("_id"))} for n in notifications]

@router.get("/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    count = await notifications_collection.count_documents({"user_id": current_user["_id"], "is_read": False})
    return {"unread_count": count}

@router.patch("/{id}/read")
async def mark_notification_as_read(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid notification ID")
    
    result = await notifications_collection.update_one(
        {"_id": ObjectId(id), "user_id": current_user["_id"]},
        {"$set": {"is_read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    return {"message": "Notification marked as read"}
