from pydantic import BaseModel, EmailStr, Field, BeforeValidator, PlainSerializer
from typing import Optional, Annotated, Any
from bson import ObjectId

# Custom type for handling MongoDB ObjectId in Pydantic V2
# Validates input as string/ObjectId, serializes output as string
PyObjectId = Annotated[
    str, 
    BeforeValidator(lambda x: str(x) if isinstance(x, ObjectId) else x),
    PlainSerializer(lambda x: str(x), return_type=str)
]

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
