from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client.social_media

# Collections
users_collection = db.users
posts_collection = db.posts
comments_collection = db.comments
notifications_collection = db.notifications
conversations_collection = db.conversations
messages_collection = db.messages
user_behaviour_collection = db.user_behaviour
