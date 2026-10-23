from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
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


async def ensure_indexes():
    """Create the indexes used by the app's frequent feed and inbox queries."""
    await asyncio.gather(
        users_collection.create_index("username", name="users_username"),
        users_collection.create_index("email", name="users_email"),
        posts_collection.create_index([("created_at", -1)], name="posts_recent"),
        posts_collection.create_index([("user_id", 1), ("created_at", -1)], name="posts_by_author"),
        comments_collection.create_index([("post_id", 1), ("created_at", 1)], name="comments_by_post"),
        comments_collection.create_index([("moderation_status", 1), ("created_at", -1)], name="comments_by_moderation"),
        conversations_collection.create_index("participants", name="conversations_by_participant"),
        messages_collection.create_index([("conversation_id", 1), ("created_at", 1)], name="messages_by_conversation"),
        messages_collection.create_index([("conversation_id", 1), ("sender_id", 1), ("is_read", 1)], name="messages_unread"),
        notifications_collection.create_index([("user_id", 1), ("created_at", -1)], name="notifications_recent"),
        notifications_collection.create_index([("user_id", 1), ("is_read", 1)], name="notifications_unread"),
        user_behaviour_collection.create_index("user_id", name="behaviour_by_user"),
    )
