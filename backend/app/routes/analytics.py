from fastapi import APIRouter, Depends, HTTPException
from ..database import comments_collection, users_collection, posts_collection
from ..routes.auth import get_current_user
from ..services.user_behaviour_service import (
    get_user_behaviour, calculate_risk_score, record_violation, record_edit
)
from bson import ObjectId
from datetime import datetime, timedelta
from collections import defaultdict

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/overview")
async def get_overview():
    total_comments = await comments_collection.count_documents({})
    safe_comments = await comments_collection.count_documents({"moderation_status": "safe"})
    toxic_comments = await comments_collection.count_documents({"moderation_status": "toxic"})
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
        "today_violations": today_violations,
    }

@router.get("/toxic-comments")
async def get_toxic_comments():
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
    comments = await comments_collection.find({"moderation_status": "toxic"}).to_list(1000)
    daily = defaultdict(int)
    for c in comments:
        created = c.get("created_at")
        if created:
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            date_str = created.strftime("%Y-%m-%d")
            daily[date_str] += 1
    sorted_days = sorted(daily.items())[-14:]
    return [{"date": d, "toxic_count": c} for d, c in sorted_days]

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

@router.post("/record-violation")
async def record_violation_route(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    behaviour = await record_violation(user_id)
    risk_score = await calculate_risk_score(user_id)
    behaviour["risk_score"] = risk_score
    return behaviour

@router.post("/record-edit")
async def record_edit_route(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    behaviour = await record_edit(user_id)
    return behaviour
