from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List
from datetime import datetime
from bson import ObjectId
from ..database import comments_collection, notifications_collection, users_collection
from ..models.social import CommentCreate, CommentUpdate, CommentResponse
from ..routes.auth import get_current_user
from ..services.moderation_service import check_toxicity, find_keyword_matches
from ..services.websocket_manager import manager
from ..services.user_behaviour_service import is_muted, record_violation

router = APIRouter(prefix="/comments", tags=["Comments"])
COMMENT_AUTHOR_FIELDS = {"username": 1, "name": 1, "profile_picture": 1}


def _serialize_comment(comment: dict, author: dict | None = None) -> dict:
    result = {key: value for key, value in comment.items() if key != "_id"}
    result["id"] = str(comment.get("_id", comment.get("id", "")))
    result["user_name"] = (author or {}).get("username") or (author or {}).get("name")
    result["user_profile_picture"] = (author or {}).get("profile_picture")
    return result


async def _serialize_comments(comments: list[dict]) -> list[dict]:
    author_ids = {
        str(comment.get("user_id"))
        for comment in comments
        if ObjectId.is_valid(str(comment.get("user_id", "")))
    }
    authors_by_id = {}

    if author_ids:
        authors = await users_collection.find(
            {"_id": {"$in": [ObjectId(author_id) for author_id in author_ids]}},
            COMMENT_AUTHOR_FIELDS,
        ).to_list(length=len(author_ids))
        authors_by_id = {str(author["_id"]): author for author in authors}

    return [
        _serialize_comment(comment, authors_by_id.get(str(comment.get("user_id", ""))))
        for comment in comments
    ]

async def run_moderation_task(comment_id: ObjectId, text: str, user_id: ObjectId):
    # Call the ML model
    result = await check_toxicity(text)
    is_toxic = bool(result.get("is_toxic"))
    source = result.get("source")
    
    # Logic: If toxic, blur it and set status
    update_data = {
        "moderation_status": "toxic" if is_toxic else "unverified" if source in {"fallback", "error"} else "safe",
        "toxicity_score": result["score"],
        "is_blurred": is_toxic,
        "moderation_highlighted_words": result.get("highlighted_words", []),
        "category_scores": result.get("category_scores", {})
    }
    
    await comments_collection.update_one(
        {"_id": comment_id},
        {"$set": update_data}
    )
    
    # If toxic, create a notification for the user
    if is_toxic:
        behaviour = await record_violation(str(user_id), result.get("score", 0.0))
        warning_count = behaviour.get("warning_count", 0)
        notification = {
            "user_id": user_id,
            "title": "Comment Flagged",
            "message": (
                "Your third community guideline warning triggered a 24-hour posting mute."
                if warning_count == 3 else
                f"Another moderation finding triggered a new 24-hour mute (warning {warning_count})."
                if warning_count > 3 else
                f"Your comment was hidden. Community guideline warning {warning_count} of 3."
            ),
            "comment_id": str(comment_id),
            "is_read": False,
            "created_at": datetime.utcnow()
        }
        await notifications_collection.insert_one(notification)
        
        # Broadcast via WebSocket
        await manager.send_personal_message({
            "type": "MODERATION_ALERT",
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
    if await is_muted(str(current_user["_id"])):
        raise HTTPException(status_code=423, detail="Your account is muted. Check your behaviour page for the mute end time.")
    if not ObjectId.is_valid(comment_in.post_id):
         raise HTTPException(status_code=400, detail="Invalid post ID")

    comment_dict = comment_in.model_dump()
    comment_dict["user_id"] = str(current_user["_id"])
    comment_dict["created_at"] = datetime.utcnow()
    comment_dict["moderation_status"] = "pending"
    comment_dict["toxicity_score"] = None
    found_keywords = find_keyword_matches(comment_in.text)
    comment_dict["is_blurred"] = bool(found_keywords)
    
    new_comment = await comments_collection.insert_one(comment_dict)
    comment_id = new_comment.inserted_id
    
    background_tasks.add_task(run_moderation_task, comment_id, comment_in.text, current_user["_id"])
    
    created_comment = await comments_collection.find_one({"_id": comment_id})
    return _serialize_comment(created_comment, current_user)

@router.patch("/{id}", response_model=CommentResponse)
async def update_comment(
    id: str,
    comment_in: CommentUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid comment ID")

    comment = await comments_collection.find_one({"_id": ObjectId(id)})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if str(comment["user_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this comment")

    if await is_muted(str(current_user["_id"])):
        raise HTTPException(status_code=423, detail="Your account is muted. Check your behaviour page for the mute end time.")

    update_data = {k: v for k, v in comment_in.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    if "text" in update_data:
        found_keywords = find_keyword_matches(update_data["text"])
        update_data.update({
            "moderation_status": "pending",
            "toxicity_score": None,
            "is_blurred": bool(found_keywords),
        })

    await comments_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    updated_comment = await comments_collection.find_one({"_id": ObjectId(id)})

    if "text" in update_data:
        background_tasks.add_task(run_moderation_task, ObjectId(id), update_data["text"], current_user["_id"])

    return (await _serialize_comments([updated_comment]))[0]

@router.get("/post/{post_id}", response_model=List[CommentResponse])
async def get_post_comments(post_id: str):
    comments = await comments_collection.find({"post_id": post_id}).to_list(100)
    return await _serialize_comments(comments)

@router.delete("/{id}")
async def delete_comment(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid comment ID")
    
    comment = await comments_collection.find_one({"_id": ObjectId(id)})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
        
    if str(comment["user_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
        
    await comments_collection.delete_one({"_id": ObjectId(id)})
    return {"message": "Comment deleted successfully"}
