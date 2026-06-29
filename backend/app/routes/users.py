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
    user = await users_collection.find_one({"_id": ObjectId(current_user["_id"])})
    if user:
        user["id"] = str(user.pop("_id"))
        user.pop("password", None)
        user["followers"] = len(user.get("followers", []))
        user["following"] = len(user.get("following", []))
    return user

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
    
    result = {
        "user": {
            "id": str(user.get("_id")),
            "username": user.get("username"),
            "email": user.get("email"),
            "name": user.get("name"),
            "bio": user.get("bio"),
            "profile_picture": user.get("profile_picture"),
            "followers": len(user.get("followers", [])),
            "following": len(user.get("following", [])),
        },
        "posts": [{**{k: v for k, v in p.items() if k != "_id"}, "id": str(p.get("_id"))} for p in posts],
        "is_following": is_following
    }
    return result

@router.put("/profile/update")
async def update_profile(data: dict, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.items() if v is not None}
    if "password" in update_data:
        update_data["password"] = get_password_hash(update_data["password"])
    await users_collection.update_one({"_id": ObjectId(current_user["_id"])}, {"$set": update_data})
    updated_user = await users_collection.find_one({"_id": ObjectId(current_user["_id"])})
    if updated_user:
        updated_user["id"] = str(updated_user.pop("_id"))
        updated_user.pop("password", None)
        updated_user["followers"] = len(updated_user.get("followers", []))
        updated_user["following"] = len(updated_user.get("following", []))
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
    return [{"id": str(u.get("_id")), **{k: v for k, v in u.items() if k not in ["_id", "followers", "following"]}, "followers": len(u.get("followers", [])), "following": len(u.get("following", []))} for u in users]

@router.get("/suggestions", response_model=List[UserResponse])
async def get_suggestions(current_user: dict = Depends(get_current_user)):
    following = current_user.get("following", [])
    exclude_ids = [ObjectId(current_user["_id"])] + [ObjectId(fid) for fid in following]
    suggestions = await users_collection.find({
        "_id": {"$nin": exclude_ids}
    }).limit(10).to_list(None)
    return [{**{k: v for k, v in s.items() if k not in ["_id", "followers", "following"]}, "id": str(s.get("_id")), "followers": len(s.get("followers", [])), "following": len(s.get("following", []))} for s in suggestions]