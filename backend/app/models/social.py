from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from .user import PyObjectId
from bson import ObjectId

class PostBase(BaseModel):
    caption: str

class PostCreate(PostBase):
    images: Optional[List[str]] = Field(default_factory=list, max_length=5)

class PostUpdate(BaseModel):
    caption: Optional[str] = None
    images: Optional[List[str]] = Field(default=None, max_length=5)

class PostResponse(PostBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id", serialization_alias="id")
    user_id: PyObjectId
    images: Optional[List[str]] = []
    created_at: datetime
    moderation_status: str = "safe"
    toxicity_score: Optional[float] = None
    is_blurred: bool = False
    ocr_text: Optional[str] = None
    ocr_status: Optional[str] = None
    moderation_highlighted_words: Optional[List[str]] = None
    category_scores: Optional[dict[str, int]] = None

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }

class CommentBase(BaseModel):
    text: str
    post_id: str

class CommentCreate(CommentBase):
    pass

class CommentUpdate(BaseModel):
    text: Optional[str] = None

class CommentResponse(CommentBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id", serialization_alias="id")
    user_id: PyObjectId
    moderation_status: str = "safe"
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
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id", serialization_alias="id")
    user_id: PyObjectId
    is_read: bool = False
    created_at: datetime

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }
