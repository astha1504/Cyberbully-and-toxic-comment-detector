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
safety_reports_collection = db.safety_reports
safety_evidence_collection = db.safety_evidence
safety_case_events_collection = db.safety_case_events


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


async def ensure_safety_report_indexes():
    """Index private safety data and expire case material after 30 days."""
    await asyncio.gather(
        safety_reports_collection.create_index(
            "case_id", unique=True, name="safety_reports_case_id"
        ),
        safety_reports_collection.create_index(
            "expires_at", expireAfterSeconds=0, name="safety_reports_expiry"
        ),
        safety_reports_collection.create_index(
            [("status", 1), ("created_at", -1)], name="safety_reports_queue"
        ),
        safety_reports_collection.create_index(
            [("reporter_id", 1), ("created_at", -1)], name="safety_reports_by_reporter"
        ),
        safety_evidence_collection.create_index(
            [("report_id", 1), ("slot", 1)], unique=True, name="safety_evidence_case_slot"
        ),
        safety_evidence_collection.create_index(
            [("reporter_id", 1), ("account_slot", 1)], unique=True, name="safety_evidence_account_slot"
        ),
        safety_evidence_collection.create_index(
            "expires_at", expireAfterSeconds=0, name="safety_evidence_expiry"
        ),
        safety_evidence_collection.create_index(
            [("reporter_id", 1), ("expires_at", 1)], name="safety_evidence_by_reporter"
        ),
        safety_case_events_collection.create_index(
            [("case_id", 1), ("created_at", 1)], name="safety_case_events_timeline"
        ),
        safety_case_events_collection.create_index(
            "expires_at", expireAfterSeconds=0, name="safety_case_events_expiry"
        ),
    )
