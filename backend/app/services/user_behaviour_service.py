from datetime import datetime, timedelta, timezone
from bson import ObjectId
from pymongo import ReturnDocument
from ..database import user_behaviour_collection
from typing import Optional


async def get_or_create_behaviour(user_id: str) -> dict:
    if not ObjectId.is_valid(user_id):
        raise ValueError("Invalid user_id")

    behaviour = await user_behaviour_collection.find_one({"user_id": ObjectId(user_id)})
    if not behaviour:
        behaviour = {
            "user_id": ObjectId(user_id),
            "warning_count": 0,
            "toxic_comments": 0,
            "edited_comments": 0,
            "mute_until": None,
            "ban_count": 0,
            "last_violation": None,
            "toxicity_score": 0.0,
        }
        await user_behaviour_collection.insert_one(behaviour)
    return behaviour


async def record_violation(user_id: str, toxicity_score: float = 0.0) -> dict:
    if not ObjectId.is_valid(user_id):
        raise ValueError("Invalid user_id")

    user_oid = ObjectId(user_id)
    now = datetime.now(timezone.utc)
    behaviour = await user_behaviour_collection.find_one_and_update(
        {"user_id": user_oid},
        {
            "$setOnInsert": {
                "user_id": user_oid,
                "edited_comments": 0,
                "mute_until": None,
                "ban_count": 0,
                "toxicity_score": 0.0,
            },
            "$inc": {"toxic_comments": 1, "warning_count": 1},
            "$set": {
                "last_violation": now.isoformat(),
                "last_toxicity_score": round(min(max(float(toxicity_score or 0), 0.0), 1.0), 4),
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    # Three server-confirmed violations trigger a 24-hour mute. The cumulative
    # strike count remains after the mute, so repeat offenders are muted again.
    if behaviour.get("warning_count", 0) >= 3:
        mute_until = (now + timedelta(hours=24)).isoformat()
        await user_behaviour_collection.update_one(
            {"user_id": user_oid},
            {"$set": {"mute_until": mute_until}},
        )
        behaviour["mute_until"] = mute_until

    behaviour["toxicity_score"] = await calculate_risk_score(user_id)
    behaviour["id"] = str(behaviour.pop("_id"))
    return behaviour


async def record_edit(user_id: str) -> dict:
    behaviour = await get_or_create_behaviour(user_id)
    await user_behaviour_collection.update_one(
        {"user_id": ObjectId(user_id)},
        {"$inc": {"edited_comments": 1}},
    )
    return await get_or_create_behaviour(user_id)


async def get_user_behaviour(user_id: str) -> Optional[dict]:
    if not ObjectId.is_valid(user_id):
        return None
    behaviour = await user_behaviour_collection.find_one({"user_id": ObjectId(user_id)})
    if not behaviour:
        return None
    behaviour["id"] = str(behaviour.pop("_id"))
    if isinstance(behaviour.get("user_id"), ObjectId):
        behaviour["user_id"] = str(behaviour["user_id"])
    return behaviour


async def calculate_risk_score(user_id: str) -> float:
    behaviour = await get_or_create_behaviour(user_id)
    toxic = behaviour.get("toxic_comments", 0)
    warnings = behaviour.get("warning_count", 0)
    bans = behaviour.get("ban_count", 0)
    score = min((toxic * 0.1) + (warnings * 0.2) + (bans * 0.5), 1.0)
    await user_behaviour_collection.update_one(
        {"user_id": ObjectId(user_id)},
        {"$set": {"toxicity_score": round(score, 4)}},
    )
    return round(score, 4)


async def is_muted(user_id: str) -> bool:
    if not ObjectId.is_valid(user_id):
        return False
    behaviour = await user_behaviour_collection.find_one({"user_id": ObjectId(user_id)})
    if not behaviour or not behaviour.get("mute_until"):
        return False
    mute_until = behaviour["mute_until"]
    if isinstance(mute_until, str):
        mute_until = datetime.fromisoformat(mute_until.replace("Z", "+00:00"))
    if mute_until.tzinfo is None:
        mute_until = mute_until.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) < mute_until.astimezone(timezone.utc)
