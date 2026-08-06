from datetime import datetime, timedelta
from bson import ObjectId
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
        behaviour["_id"] = behaviour.pop("_id", None)
    return behaviour


async def record_violation(user_id: str, toxicity_score: float = 0.0) -> dict:
    behaviour = await get_or_create_behaviour(user_id)

    updates = {
        "toxic_comments": behaviour.get("toxic_comments", 0) + 1,
        "last_violation": datetime.utcnow().isoformat(),
    }

    new_warnings = behaviour.get("warning_count", 0) + 1
    updates["warning_count"] = new_warnings

    if new_warnings >= 3:
        updates["mute_until"] = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    if new_warnings >= 5:
        updates["ban_count"] = behaviour.get("ban_count", 0) + 1
        updates["warning_count"] = 0

    await user_behaviour_collection.update_one(
        {"user_id": ObjectId(user_id)},
        {"$set": updates},
    )

    return await get_or_create_behaviour(user_id)


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
        mute_until = datetime.fromisoformat(mute_until)
    return datetime.utcnow() < mute_until
