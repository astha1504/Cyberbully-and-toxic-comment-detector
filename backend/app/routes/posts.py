from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime
from bson import ObjectId
from ..database import posts_collection
from ..models.social import PostCreate, PostResponse
from ..routes.auth import get_current_user

router = APIRouter(prefix="/posts", tags=["Posts"])

@router.post("/", response_model=PostResponse)
async def create_post(post_in: PostCreate, current_user: dict = Depends(get_current_user)):
    post_dict = post_in.model_dump()
    post_dict["user_id"] = str(current_user["_id"])
    post_dict["created_at"] = datetime.utcnow()
    
    new_post = await posts_collection.insert_one(post_dict)
    created_post = await posts_collection.find_one({"_id": new_post.inserted_id})
    created_post["id"] = str(created_post.pop("_id"))
    return created_post

@router.get("/", response_model=List[PostResponse])
async def get_posts():
    posts = await posts_collection.find().to_list(100)
    return [{**{k: v for k, v in p.items() if k != "_id"}, "id": str(p.get("_id"))} for p in posts]

@router.get("/{id}", response_model=PostResponse)
async def get_post(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post["id"] = str(post.pop("_id"))
    return post

@router.post("/{id}/like")
async def like_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    likes = post.get("likes", [])
    user_id = current_user["_id"]
    if str(user_id) in [str(like) for like in likes]:
        likes = [like for like in likes if str(like) != str(user_id)]
        liked = False
    else:
        likes.append(user_id)
        liked = True
    
    await posts_collection.update_one({"_id": ObjectId(id)}, {"$set": {"likes": likes}})
    return {"liked": liked}

@router.delete("/{id}/like")
async def unlike_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    likes = post.get("likes", [])
    user_id = current_user["_id"]
    likes = [like for like in likes if str(like) != str(user_id)]
    
    await posts_collection.update_one({"_id": ObjectId(id)}, {"$set": {"likes": likes}})
    return {"liked": False}

@router.delete("/{id}")
async def delete_post(id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid post ID")
    
    post = await posts_collection.find_one({"_id": ObjectId(id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if post["user_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")
        
    await posts_collection.delete_one({"_id": ObjectId(id)})
    return {"message": "Post deleted successfully"}
