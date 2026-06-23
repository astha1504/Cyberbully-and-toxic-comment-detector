from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from .user import PyObjectId
from bson import ObjectId

class PostBase(BaseModel):
    content: str

class PostCreate(PostBase):
    pass

class PostResponse(PostBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    user_id: PyObjectId
    created_at: datetime

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }

class CommentBase(BaseModel):
    text: str
    post_id: str

class CommentCreate(CommentBase):
    pass

class CommentResponse(CommentBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    user_id: PyObjectId
    moderation_status: str = "pending"
    toxicity_score: Optional[float] = None
    is_blurred: bool = False
    created_at: datetime

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }

class NotificationBase(BaseModel):
    title: str
    message: str
    comment_id: Optional[str] = None

class NotificationResponse(NotificationBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    user_id: PyObjectId
    is_read: bool = False
    created_at: datetime

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }
