from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, posts, comments, notifications, analytics, websockets

app = FastAPI(
    title="AI-Powered Toxic Comment Detector",
    description="Backend for detecting and moderating toxic comments in real-time.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.get("/")
async def root():
    return {"message": "Welcome to the AI-Powered Toxic Comment Detector API"}
