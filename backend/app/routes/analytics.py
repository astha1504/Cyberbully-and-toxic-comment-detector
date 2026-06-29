from fastapi import APIRouter, Depends
from ..database import comments_collection, users_collection
from ..routes.auth import get_current_user
from bson import ObjectId

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/overview")
async def get_overview():
    total_comments = await comments_collection.count_documents({})
    safe_comments = await comments_collection.count_documents({"moderation_status": "safe"})
    toxic_comments = await comments_collection.count_documents({"moderation_status": "toxic"})
    
    return {
        "total_comments": total_comments,
        "safe_comments": safe_comments,
        "toxic_comments": toxic_comments
    }

@router.get("/toxic-comments")
async def get_toxic_comments():
    # Return last 20 toxic comments for review
    comments = await comments_collection.find({"moderation_status": "toxic"}).sort("created_at", -1).limit(20).to_list(20)
    result = []
    for c in comments:
        user_id = c.get("user_id")
        user_name = None
        if user_id:
            user = await users_collection.find_one({"_id": ObjectId(user_id)})
            user_name = user.get("username") if user else None
        result.append({
            **{k: v for k, v in c.items() if k != "_id"},
            "id": str(c.get("_id")),
            "user_name": user_name
        })
    return result

@router.get("/toxicity-trend")
async def get_toxicity_trend():
    # Simple mock trend for hackathon demo
    # In a real app, you'd aggregate by date
    return [
        {"date": "2024-06-05", "toxic_count": 5},
        {"date": "2024-06-06", "toxic_count": 8},
        {"date": "2024-06-07", "toxic_count": 3},
        {"date": "2024-06-08", "toxic_count": 12},
        {"date": "2024-06-09", "toxic_count": 7},
        {"date": "2024-06-10", "toxic_count": 10},
    ]
