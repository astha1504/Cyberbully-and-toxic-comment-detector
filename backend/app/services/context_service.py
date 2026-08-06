from typing import List, Dict, Any
from bson import ObjectId
from ..database import messages_collection


async def get_conversation_context(conversation_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    messages = await messages_collection.find(
        {"conversation_id": conversation_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)

    return [
        {
            "sender_id": str(m["sender_id"]),
            "content": m.get("content", ""),
            "is_toxic": m.get("is_toxic", False),
            "created_at": m["created_at"].isoformat() if m.get("created_at") else None,
        }
        for m in reversed(messages)
    ]


def build_context_prompt(messages: List[Dict[str, Any]], current_text: str, current_user_id: str) -> str:
    lines = []
    for m in messages:
        role = "User" if m["sender_id"] == current_user_id else "Other"
        prefix = "[TOXIC]" if m.get("is_toxic") else ""
        lines.append(f"{role} {prefix}: {m['content']}")
    lines.append(f"Current User: {current_text}")
    return "\n".join(lines)


async def compute_context_score(conversation_id: str) -> Dict[str, Any]:
    messages = await get_conversation_context(conversation_id, limit=10)
    toxic_count = sum(1 for m in messages if m.get("is_toxic"))
    score = min(toxic_count / 10, 1.0)

    if toxic_count >= 5:
        label = "suppression_pattern"
    elif toxic_count >= 3:
        label = "potential_bullying"
    else:
        label = "normal"

    return {
        "toxic_message_count": toxic_count,
        "context_score": round(score, 4),
        "label": label,
        "recent_messages": messages,
    }
