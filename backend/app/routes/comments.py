from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List
from datetime import datetime
from bson import ObjectId
from ..database import comments_collection, notifications_collection
from ..models.social import CommentCreate, CommentResponse
from ..routes.auth import get_current_user
from ..services.moderation_service import check_toxicity
from ..services.websocket_manager import manager

router = APIRouter(prefix="/comments", tags=["Comments"])

async def run_moderation_task(comment_id: ObjectId, text: str, user_id: ObjectId):
    # Call the ML model
    result = await check_toxicity(text)
    
    # Logic: If toxic, blur it and set status
    update_data = {
        "moderation_status": "toxic" if result["is_toxic"] else "safe",
        "toxicity_score": result["score"],
        "is_blurred": result["is_toxic"]
    }
    
    await comments_collection.update_one(
        {"_id": comment_id},
        {"$set": update_data}
    )
    
    # If toxic, create a notification for the user
    if result["is_toxic"]:
        notification = {
            "user_id": user_id,
            "title": "Comment Flagged",
            "message": "Your comment was hidden because it violated community guidelines.",
            "comment_id": str(comment_id),
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await notifications_collection.insert_one(notification)
        
        # Broadcast via WebSocket
        await manager.send_personal_message({
            "type": "notification",
            "title": notification["title"],
            "message": notification["message"],
            "comment_id": notification["comment_id"],
            "created_at": notification["created_at"].isoformat()
        }, str(user_id))

@router.post("/", response_model=CommentResponse)
async def create_comment(
    comment_in: CommentCreate, 
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    if not ObjectId.is_valid(comment_in.post_id):
         raise HTTPException(status_code=400, detail="Invalid post ID")

    comment_dict = comment_in.model_dump()
    comment_dict["user_id"] = current_user["_id"]
    comment_dict["moderation_status"] = "pending"
    comment_dict["toxicity_score"] = None
    comment_dict["is_blurred"] = False
    comment_dict["created_at"] = datetime.utcnow()
    
    new_comment = await comments_collection.insert_one(comment_dict)
    comment_id = new_comment.inserted_id
    
    # Trigger background moderation
    background_tasks.add_task(run_moderation_task, comment_id, comment_in.text, current_user["_id"])
    
    created_comment = await comments_collection.find_one({"_id": comment_id})
    return created_comment

@router.get("/post/{post_id}", response_model=List[CommentResponse])
async def get_post_comments(post_id: str):
    return await comments_collection.find({"post_id": post_id}).to_list(100)

@router.delete("/{id}")
async def delete_comment(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    
    comment = await comments_collection.find_one({"_id": ObjectId(id)})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
        
    if comment["user_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
        
    await comments_collection.delete_one({"_id": ObjectId(id)})
    return {"message": "Comment deleted successfully"}
