from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, posts, comments, notifications, analytics, websockets, users, chat, moderation, cyber_safety
from .database import ensure_indexes, ensure_safety_report_indexes

app = FastAPI(
    title="Pehra Community and Cyber Safety API",
    description="Community moderation, cyber-safety analysis, and private safety case workflows.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(comments.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(websockets.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(moderation.router)
app.include_router(cyber_safety.router)


@app.on_event("startup")
async def create_database_indexes():
    await ensure_indexes()
    await ensure_safety_report_indexes()

@app.get("/")
async def root():
    return {"message": "Welcome to the Pehra safety platform API"}
