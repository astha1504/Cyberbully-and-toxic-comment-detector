from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from bson import ObjectId
from ..database import users_collection
from ..models.user import UserResponse
from ..routes.auth import get_current_user
from ..services.auth_service import verify_password, get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    return current_user

@router.get("/profile/{user_id}")
async def get_user_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    posts_cursor = users_collection.database["posts"].find({"user_id": user_id})
    posts = await posts_cursor.to_list(None)
    
    is_following = str(current_user["_id"]) in user.get("followers", [])
    
    user["followers"] = len(user.get("followers", []))
    user["following"] = len(user.get("following", []))
    
    return {"user": user, "posts": posts, "is_following": is_following}

@router.put("/profile/update")
async def update_profile(data: dict, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.items() if v is not None}
    await users_collection.update_one({"_id": ObjectId(current_user["_id"])}, {"$set": update_data})
    updated_user = await users_collection.find_one({"_id": ObjectId(current_user["_id"])})
    return updated_user

@router.post("/{user_id}/follow")
async def follow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    if user_id == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"followers": str(current_user["_id"])}}
    )
    await users_collection.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$addToSet": {"following": str(user_id)}}
    )
    return {"message": "User followed"}

@router.post("/{user_id}/unfollow")
async def unfollow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"followers": str(current_user["_id"])}}
    )
    await users_collection.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$pull": {"following": str(user_id)}}
    )
    return {"message": "User unfollowed"}

@router.get("/search")
async def search_users(q: str):
    if not q:
        return []
    users = await users_collection.find({
        "$or": [
            {"username": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}}
        ]
    }).to_list(20)
    return users

@router.get("/suggestions", response_model=List[UserResponse])
async def get_suggestions(current_user: dict = Depends(get_current_user)):
    following = current_user.get("following", [])
    exclude_ids = [ObjectId(current_user["_id"])] + [ObjectId(fid) for fid in following]
    suggestions = await users_collection.find({
        "_id": {"$nin": exclude_ids}
    }).limit(10).to_list(None)
    return suggestions