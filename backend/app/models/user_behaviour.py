from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId
from .user import PyObjectId


class UserBehaviourBase(BaseModel):
    user_id: PyObjectId
    warning_count: int = 0
    toxic_comments: int = 0
    edited_comments: int = 0
    mute_until: Optional[str] = None
    ban_count: int = 0
    last_violation: Optional[str] = None
    toxicity_score: float = 0.0


class UserBehaviourResponse(UserBehaviourBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id", serialization_alias="id")

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }
