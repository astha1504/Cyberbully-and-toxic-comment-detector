from fastapi import APIRouter, Depends, HTTPException
from ..database import comments_collection, users_collection, posts_collection
from ..routes.auth import get_current_user
from ..services.user_behaviour_service import (
    get_user_behaviour, calculate_risk_score
)
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user)):
    total_comments = await comments_collection.count_documents({})
    safe_comments = await comments_collection.count_documents({"moderation_status": "safe"})
    toxic_comments = await comments_collection.count_documents({"moderation_status": "toxic"})
    unverified_comments = max(total_comments - safe_comments - toxic_comments, 0)
    total_posts = await posts_collection.count_documents({})
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_violations = await comments_collection.count_documents({
        "moderation_status": "toxic",
        "created_at": {"$gte": today}
    })
    return {
        "total_posts": total_posts,
        "total_comments": total_comments,
        "safe_comments": safe_comments,
        "toxic_comments": toxic_comments,
        "unverified_comments": unverified_comments,
        "today_violations": today_violations,
    }

@router.get("/toxic-comments")
async def get_toxic_comments(current_user: dict = Depends(get_current_user)):
    comments = await comments_collection.find({"moderation_status": "toxic"}).sort("created_at", -1).limit(20).to_list(20)
    result = []
    for c in comments:
        user_id = c.get("user_id")
        user_name = None
        if user_id and ObjectId.is_valid(user_id):
            user = await users_collection.find_one({"_id": ObjectId(user_id)})
            user_name = user.get("username") if user else None
        result.append({
            **{k: v for k, v in c.items() if k != "_id"},
            "id": str(c.get("_id")),
            "user_id": str(user_id) if user_id is not None else None,
            "user_name": user_name
        })
    return result

@router.get("/toxicity-trend")
async def get_toxicity_trend(current_user: dict = Depends(get_current_user)):
    today = datetime.utcnow().date()
    first_day = today - timedelta(days=13)
    start = datetime.combine(first_day, datetime.min.time())
    daily = {
        (first_day + timedelta(days=offset)).strftime("%Y-%m-%d"):
            {"safe_count": 0, "toxic_count": 0}
        for offset in range(14)
    }
    rows = await comments_collection.aggregate([
        {
            "$match": {
                "moderation_status": {"$in": ["safe", "toxic"]},
                "created_at": {"$gte": start},
            }
        },
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "status": "$moderation_status",
                },
                "count": {"$sum": 1},
            }
        },
    ]).to_list(None)
    for row in rows:
        date = row["_id"]["date"]
        status = row["_id"]["status"]
        if date in daily and status in {"safe", "toxic"}:
            daily[date][f"{status}_count"] = row["count"]
    return [{"date": date, **counts} for date, counts in daily.items()]

@router.get("/user-behaviour")
async def get_user_behaviour_route(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    behaviour = await get_user_behaviour(user_id)
    risk_score = await calculate_risk_score(user_id)
    if not behaviour:
        return {
            "user_id": user_id,
            "warning_count": 0,
            "toxic_comments": 0,
            "edited_comments": 0,
            "mute_until": None,
            "ban_count": 0,
            "last_violation": None,
            "toxicity_score": 0.0,
            "risk_score": risk_score,
        }
    behaviour["risk_score"] = risk_score
    return behaviour
