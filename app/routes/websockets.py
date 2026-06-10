from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from ..services.websocket_manager import manager
from jose import jwt, JWTError
from ..config import settings
from ..database import users_collection

router = APIRouter(tags=["WebSockets"])

async def get_user_from_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = await users_collection.find_one({"username": username})
        return user
    except JWTError:
        return None

@router.websocket("/ws/notifications")
async def websocket_endpoint(
    websocket: WebSocket, 
    token: str = Query(...)
):
    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=1008) # Policy Violation
        return

    user_id = str(user["_id"])
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            # Keep connection alive, listen for any client messages if needed
            data = await websocket.receive_text()
            # We aren't expecting messages from client for now, but we'll respond with pong
            await websocket.send_json({"type": "pong", "data": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
