from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Query
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
from ..database import posts_collection, notifications_collection
from ..models.social import PostCreate, PostUpdate, PostResponse
from ..routes.auth import get_current_user
from ..services.moderation_service import check_toxicity
from ..services.websocket_manager import manager
from ..services.image_ocr import extract_text_from_image_data
from ..services.user_behaviour_service import is_muted, record_violation

router = APIRouter(prefix="/posts", tags=["Posts"])
MAX_POST_IMAGE_CHARS = 13 * 1024 * 1024


def validate_image_payload(images: list[str] | None) -> None:
    if sum(len(image) for image in images or []) > MAX_POST_IMAGE_CHARS:
        raise HTTPException(status_code=413, detail="Combined image uploads must stay below 13 MB of encoded data")


async def run_post_moderation_task(post_id: ObjectId, text: str, images: list[str], user_id: ObjectId):
    result = await check_toxicity(text)
    is_toxic = bool(result.get("is_toxic"))
    source = result.get("source")
    detected_text = []
    highlighted = list(result.get("highlighted_words", []))
    category_scores = dict(result.get("category_scores", {}))
    ocr_unavailable = False

    for image_data in images or []:
        try:
            image_text = await extract_text_from_image_data(image_data)
        except (ValueError, RuntimeError):
            ocr_unavailable = True
            continue
        if not image_text:
            continue
        detected_text.append(image_text)
        image_result = await check_toxicity(image_text)
        is_toxic = is_toxic or bool(image_result.get("is_toxic"))
        if image_result.get("source") in {"fallback", "error"}:
            source = image_result.get("source")
        if image_result.get("score", 0) > result.get("score", 0):
            result = image_result
        highlighted.extend(image_result.get("highlighted_words", []))
        for category, score in image_result.get("category_scores", {}).items():
            category_scores[category] = max(category_scores.get(category, 0), score)

    update_data = {
        "moderation_status": "flagged" if is_toxic else "unverified" if source in {"fallback", "error"} or ocr_unavailable else "safe",
        "toxicity_score": result["score"],
        "is_blurred": is_toxic,
        "ocr_text": "\n".join(detected_text)[:2000],
        "moderation_highlighted_words": list(dict.fromkeys(highlighted)),
        "category_scores": category_scores,
        "ocr_status": "unavailable" if ocr_unavailable else "complete",
    }

    await posts_collection.update_one(
        {"_id": post_id},
        {"$set": update_data}
    )

    if is_toxic:
        behaviour = await record_violation(str(user_id), result.get("score", 0.0))
        warning_count = behaviour.get("warning_count", 0)

        notification = {
            "user_id": user_id,
            "title": "Post Flagged",
            "message": (
                "Your third community guideline warning triggered a 24-hour posting mute."
                if warning_count == 3 else
                f"Another moderation finding triggered a new 24-hour mute (warning {warning_count})."
                if warning_count > 3 else
                f"Your post was flagged. Community guideline warning {warning_count} of 3."
            ),
            "post_id": str(post_id),
            "is_read": False,
            "created_at": datetime.utcnow(),
        }
        await notifications_collection.insert_one(notification)

        await manager.send_personal_message({
            "type": "MODERATION_ALERT",
            "title": notification["title"],
            "message": notification["message"],
            "post_id": notification["post_id"],
            "created_at": notification["created_at"].isoformat(),
        }, str(user_id))

@router.post("/", response_model=PostResponse)
async def create_post(post_in: PostCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if await is_muted(str(current_user["_id"])):
        raise HTTPException(status_code=423, detail="Your account is muted. Check your behaviour page for the mute end time.")
    validate_image_payload(post_in.images)

    post_dict = post_in.model_dump()
    post_dict["user_id"] = str(current_user["_id"])
    post_dict["created_at"] = datetime.utcnow()
    post_dict["moderation_status"] = "pending"
    post_dict["toxicity_score"] = None
    post_dict["is_blurred"] = False

    new_post = await posts_collection.insert_one(post_dict)
    post_id = new_post.inserted_id

    background_tasks.add_task(run_post_moderation_task, post_id, post_in.caption, post_in.images or [], current_user["_id"])

    created_post = await posts_collection.find_one({"_id": post_id})
    created_post["id"] = str(created_post.pop("_id"))
    return created_post

@router.get("/", response_model=List[PostResponse])
async def get_posts(limit: int = Query(20, ge=1, le=100), skip: int = Query(0, ge=0)):
    posts = await posts_collection.find().sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return [{**{k: v for k, v in p.items() if k != "_id"}, "id": str(p.get("_id"))} for p in posts]

@router.get("/{id}", response_model=PostResponse)
async def get_post(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post["id"] = str(post.pop("_id"))
    return post

@router.post("/{id}/like")
async def like_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    user_id = str(current_user["_id"])
    likes = [str(like) for like in post.get("likes", [])]
    if user_id in likes:
        likes = [like for like in likes if like != user_id]
        liked = False
    else:
        likes.append(user_id)
        liked = True

    await posts_collection.update_one({"_id": ObjectId(id)}, {"$set": {"likes": likes}})
    return {"liked": liked}

@router.delete("/{id}/like")
async def unlike_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    user_id = str(current_user["_id"])
    likes = [str(like) for like in post.get("likes", []) if str(like) != user_id]

    await posts_collection.update_one({"_id": ObjectId(id)}, {"$set": {"likes": likes}})
    return {"liked": False}

@router.patch("/{id}", response_model=PostResponse)
async def update_post(id: str, post_in: PostUpdate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")

    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if str(post["user_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this post")

    if await is_muted(str(current_user["_id"])):
        raise HTTPException(status_code=423, detail="Your account is muted. Check your behaviour page for the mute end time.")
    validate_image_payload(post_in.images)

    update_data = {k: v for k, v in post_in.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    if "caption" in update_data or "images" in update_data:
        update_data.update({
            "moderation_status": "pending",
            "toxicity_score": None,
            "is_blurred": False,
        })

    await posts_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    updated_post = await posts_collection.find_one({"_id": ObjectId(id)})
    updated_post["id"] = str(updated_post.pop("_id"))

    if "caption" in update_data or "images" in update_data:
        background_tasks.add_task(
            run_post_moderation_task,
            ObjectId(id),
            update_data.get("caption", post.get("caption", "")),
            update_data.get("images", post.get("images", [])),
            current_user["_id"],
        )

    return updated_post

@router.delete("/{id}")
async def delete_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")

    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if str(post["user_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    await posts_collection.delete_one({"_id": ObjectId(id)})
    return {"message": "Post deleted successfully"}
