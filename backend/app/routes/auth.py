from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from ..config import settings
from ..database import users_collection
from ..models.user import UserCreate, UserResponse, Token, TokenData
from ..services.auth_service import verify_password, get_password_hash, create_access_token
from datetime import timedelta
from bson import ObjectId

router = APIRouter(prefix="/auth", tags=["Authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    user = await users_collection.find_one({"username": token_data.username})
    if user is None:
        raise credentials_exception
    return user

@router.post("/register")
async def register(user_in: UserCreate):
    if await users_collection.find_one({"username": user_in.username}):
        raise HTTPException(status_code=400, detail="Username already registered")
    if await users_collection.find_one({"email": user_in.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = user_in.model_dump()
    user_dict["password"] = get_password_hash(user_in.password)
    user_dict["followers"] = []
    user_dict["following"] = []
    if not user_dict.get("name"):
        user_dict["name"] = user_in.username
    
    new_user = await users_collection.insert_one(user_dict)
    created_user = await users_collection.find_one({"_id": new_user.inserted_id})
    created_user["id"] = str(created_user.pop("_id"))
    created_user.pop("password", None)
    created_user["followers"] = len(created_user.get("followers", []))
    created_user["following"] = len(created_user.get("following", []))
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_in.username}, expires_delta=access_token_expires
    )
    
    return {"user": created_user, "token": access_token}

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await users_collection.find_one({"username": form_data.username})
    if not user:
        user = await users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    user = await users_collection.find_one({"_id": ObjectId(current_user["_id"])})
    if user:
        user["id"] = str(user.pop("_id"))
        user.pop("password", None)
        user["followers"] = len(user.get("followers", []))
        user["following"] = len(user.get("following", []))
    return user
