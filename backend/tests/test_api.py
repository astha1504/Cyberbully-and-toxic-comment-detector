import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.routes import (
    analytics as analytics_routes,
    auth as auth_routes,
    chat as chat_routes,
    comments as comments_routes,
    moderation as moderation_routes,
    notifications as notifications_routes,
    posts as posts_routes,
    users as users_routes,
    websockets as websocket_routes,
)
from app.services import moderation_service, user_behaviour_service
from tests.fakes import FakeCollection, FakeDatabase


SAFE_RESULT = {
    "is_toxic": False,
    "score": 0.12,
    "label": "non_offensive",
    "source": "ml_model",
    "highlighted_words": [],
    "category_scores": {"insult": 0, "harassment": 0, "threat": 0},
}
TOXIC_RESULT = {
    "is_toxic": True,
    "score": 0.95,
    "label": "abusive",
    "source": "keyword_match",
    "highlighted_words": ["stupid"],
    "category_scores": {"insult": 100, "harassment": 0, "threat": 0},
}


class StubProviderResponse:
    def __init__(self, status_code=200, payload=None, json_error=None):
        self.status_code = status_code
        self.payload = payload
        self.json_error = json_error

    def json(self):
        if self.json_error:
            raise self.json_error
        return self.payload


class StubProviderClient:
    def __init__(self, response):
        self.response = response
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, *args, **kwargs):
        self.requests.append((args, kwargs))
        return self.response


class PlatformApiTestCase(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.db = FakeDatabase()
        self.users = self.db["users"]
        self.posts = self.db["posts"]
        self.comments = self.db["comments"]
        self.notifications = self.db["notifications"]
        self.conversations = self.db["conversations"]
        self.messages = self.db["messages"]
        self.behaviour = self.db["user_behaviour"]
        self.user_id = ObjectId("65a000000000000000000001")
        self.other_id = ObjectId("65a000000000000000000002")
        self.user = {
            "_id": self.user_id,
            "username": "alice",
            "email": "alice@example.com",
            "name": "Alice Example",
            "bio": "Demo profile",
            "profile_picture": None,
            "password": "",
            "followers": [],
            "following": [],
            "friends": [],
        }
        self.other_user = {
            "_id": self.other_id,
            "username": "bob",
            "email": "bob@example.com",
            "name": "Bob Example",
            "profile_picture": None,
            "followers": [],
            "following": [],
        }
        self.users.documents.extend([self.user, self.other_user])
        self._patch_collection(auth_routes, "users_collection", self.users)
        self._patch_collection(users_routes, "users_collection", self.users)
        self._patch_collection(posts_routes, "posts_collection", self.posts)
        self._patch_collection(posts_routes, "notifications_collection", self.notifications)
        self._patch_collection(comments_routes, "comments_collection", self.comments)
        self._patch_collection(comments_routes, "notifications_collection", self.notifications)
        self._patch_collection(notifications_routes, "notifications_collection", self.notifications)
        self._patch_collection(chat_routes, "users_collection", self.users)
        self._patch_collection(chat_routes, "conversations_collection", self.conversations)
        self._patch_collection(chat_routes, "messages_collection", self.messages)
        self._patch_collection(analytics_routes, "comments_collection", self.comments)
        self._patch_collection(analytics_routes, "users_collection", self.users)
        self._patch_collection(analytics_routes, "posts_collection", self.posts)
        self._patch_collection(websocket_routes, "users_collection", self.users)
        self._patch_collection(websocket_routes, "messages_collection", self.messages)
        self._patch_collection(websocket_routes, "conversations_collection", self.conversations)
        self._patch_collection(moderation_service, "users_collection", self.users)
        self._patch_collection(moderation_service, "messages_collection", self.messages)
        self._patch_collection(user_behaviour_service, "user_behaviour_collection", self.behaviour)
        self.stack.enter_context(
            patch.object(moderation_service, "_ensure_model_loaded", new=AsyncMock())
        )
        self.stack.enter_context(patch.object(posts_routes, "check_toxicity", new=AsyncMock(return_value=SAFE_RESULT)))
        self.stack.enter_context(patch.object(comments_routes, "check_toxicity", new=AsyncMock(return_value=SAFE_RESULT)))
        self.stack.enter_context(patch.object(posts_routes, "extract_text_from_image_data", new=AsyncMock(return_value="")))
        self.stack.enter_context(patch.object(websocket_routes, "get_user_from_token", new=AsyncMock(return_value=self.user)))
        self.stack.enter_context(patch.object(websocket_routes, "check_chat_toxicity", new=AsyncMock(return_value=SAFE_RESULT)))
        self.stack.enter_context(patch.object(websocket_routes, "is_muted", new=AsyncMock(return_value=False)))
        self.stack.enter_context(patch.object(websocket_routes, "record_violation", new=AsyncMock(return_value={"warning_count": 1})))
        websocket_routes.manager.active_connections.clear()
        app.dependency_overrides[auth_routes.get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        websocket_routes.manager.active_connections.clear()
        self.stack.close()

    def _patch_collection(self, module, name, value):
        self.stack.enter_context(patch.object(module, name, value))


class CoreRouteTests(PlatformApiTestCase):
    def test_root_and_openapi_describe_all_route_families(self):
        self.assertEqual(self.client.get("/").json()["message"], "Welcome to the Pehra safety platform API")
        paths = self.client.get("/openapi.json").json()["paths"]
        for path in (
            "/auth/register", "/auth/login", "/posts/", "/comments/", "/users/search",
            "/notifications/", "/chat/conversations", "/analytics/overview",
            "/api/moderation/check-text", "/api/moderation/check-image", "/api/moderation/check-audio",
        ):
            self.assertIn(path, paths)

    def test_protected_route_requires_authentication(self):
        app.dependency_overrides.clear()
        response = self.client.get("/users/profile")
        self.assertEqual(response.status_code, 401)

    def test_registration_hashes_password_and_returns_token_without_secret(self):
        response = self.client.post("/auth/register", json={
            "username": "carol", "email": "carol@example.com", "password": "pass1234",
        })
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["token"])
        self.assertEqual(body["user"]["username"], "carol")
        self.assertNotIn("password", body["user"])
        stored = next(user for user in self.users.documents if user["username"] == "carol")
        self.assertNotEqual(stored["password"], "pass1234")
        self.assertEqual(stored["followers"], [])
        self.assertEqual(stored["following"], [])

    def test_registration_rejects_existing_username_and_email_and_long_utf8_password(self):
        duplicate_user = self.client.post("/auth/register", json={
            "username": "alice", "email": "new@example.com", "password": "pass1234",
        })
        duplicate_email = self.client.post("/auth/register", json={
            "username": "newuser", "email": "alice@example.com", "password": "pass1234",
        })
        long_password = self.client.post("/auth/register", json={
            "username": "newuser", "email": "new@example.com", "password": "é" * 37,
        })
        self.assertEqual(duplicate_user.status_code, 400)
        self.assertEqual(duplicate_email.status_code, 400)
        self.assertEqual(long_password.status_code, 422)

    def test_login_accepts_username_or_email_and_rejects_bad_password(self):
        from app.services.auth_service import get_password_hash

        self.user["password"] = get_password_hash("correct horse")
        for username in ("alice", "alice@example.com"):
            response = self.client.post("/auth/login", data={"username": username, "password": "correct horse"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["token_type"], "bearer")
        bad = self.client.post("/auth/login", data={"username": "alice", "password": "wrong"})
        self.assertEqual(bad.status_code, 401)

    def test_read_current_user_serializes_object_id_and_hides_password(self):
        response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["id"], str(self.user_id))
        self.assertEqual(body["followers"], 0)
        self.assertNotIn("password", body)

    def test_post_create_list_read_update_like_and_delete(self):
        created = self.client.post("/posts/", json={"caption": "A useful demo", "images": []})
        self.assertEqual(created.status_code, 200, created.text)
        post_id = created.json()["id"]
        self.assertEqual(created.json()["moderation_status"], "pending")
        self.assertEqual(self.posts.documents[0]["moderation_status"], "safe")

        listed = self.client.get("/posts/?limit=1&skip=0")
        fetched = self.client.get(f"/posts/{post_id}")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["id"], post_id)
        self.assertEqual(fetched.json()["caption"], "A useful demo")

        liked = self.client.post(f"/posts/{post_id}/like")
        unliked = self.client.post(f"/posts/{post_id}/like")
        forced_unlike = self.client.delete(f"/posts/{post_id}/like")
        self.assertTrue(liked.json()["liked"])
        self.assertFalse(unliked.json()["liked"])
        self.assertFalse(forced_unlike.json()["liked"])

        updated = self.client.patch(f"/posts/{post_id}", json={"caption": "Updated"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["caption"], "Updated")
        deleted = self.client.delete(f"/posts/{post_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.posts.documents, [])

    def test_post_validation_pagination_muting_and_ownership(self):
        self.assertEqual(self.client.get("/posts/?limit=101").status_code, 422)
        self.assertEqual(self.client.get("/posts/not-an-object-id").status_code, 400)
        self.assertEqual(self.client.get(f"/posts/{ObjectId()}").status_code, 404)
        self.assertEqual(self.client.patch("/posts/not-an-id", json={"caption": "x"}).status_code, 400)

        post_id = ObjectId()
        self.posts.documents.append({"_id": post_id, "user_id": str(self.other_id), "caption": "Bob post", "images": [], "created_at": datetime.utcnow()})
        self.assertEqual(self.client.patch(f"/posts/{post_id}", json={"caption": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/posts/{post_id}").status_code, 403)
        empty_update = ObjectId()
        self.posts.documents.append({"_id": empty_update, "user_id": str(self.user_id), "caption": "Original", "images": [], "created_at": datetime.utcnow()})
        self.assertEqual(self.client.patch(f"/posts/{empty_update}", json={}).status_code, 400)
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as oversized:
            posts_routes.validate_image_payload(["a" * (posts_routes.MAX_POST_IMAGE_CHARS + 1)])
        self.assertEqual(oversized.exception.status_code, 413)

        now = datetime.utcnow() + timedelta(hours=1)
        self.behaviour.documents.append({"_id": ObjectId(), "user_id": self.user_id, "mute_until": now.isoformat()})
        muted = self.client.post("/posts/", json={"caption": "blocked", "images": []})
        self.assertEqual(muted.status_code, 423)

    def test_post_background_moderation_flags_ocr_text_and_records_unavailable_ocr(self):
        self.stack.enter_context(patch.object(posts_routes, "check_toxicity", new=AsyncMock(side_effect=[SAFE_RESULT, TOXIC_RESULT])))
        self.stack.enter_context(patch.object(posts_routes, "extract_text_from_image_data", new=AsyncMock(return_value="you are stupid")))
        response = self.client.post("/posts/", json={"caption": "A poster", "images": ["data:image/png;base64,YQ=="]})
        self.assertEqual(response.status_code, 200, response.text)
        flagged = self.posts.documents[-1]
        self.assertEqual(flagged["moderation_status"], "flagged")
        self.assertTrue(flagged["is_blurred"])
        self.assertEqual(flagged["ocr_text"], "you are stupid")
        self.assertEqual(flagged["moderation_highlighted_words"], ["stupid"])
        self.assertEqual(self.notifications.documents[-1]["title"], "Post Flagged")

        self.stack.enter_context(patch.object(posts_routes, "check_toxicity", new=AsyncMock(return_value=SAFE_RESULT)))
        self.stack.enter_context(patch.object(posts_routes, "extract_text_from_image_data", new=AsyncMock(side_effect=RuntimeError("OCR unavailable"))))
        self.client.post("/posts/", json={"caption": "OCR outage", "images": ["data:image/png;base64,YQ=="]})
        unavailable = self.posts.documents[-1]
        self.assertEqual(unavailable["moderation_status"], "unverified")
        self.assertEqual(unavailable["ocr_status"], "unavailable")

    def test_comment_create_edit_list_delete_and_permissions(self):
        post_id = str(ObjectId())
        created = self.client.post("/comments/", json={"post_id": post_id, "text": "Helpful comment"})
        self.assertEqual(created.status_code, 200, created.text)
        comment_id = created.json()["id"]
        self.assertEqual(created.json()["moderation_status"], "pending")
        listed = self.client.get(f"/comments/post/{post_id}")
        self.assertEqual(listed.json()[0]["text"], "Helpful comment")

        empty_update = self.client.patch(f"/comments/{comment_id}", json={})
        self.assertEqual(empty_update.status_code, 400)
        updated = self.client.patch(f"/comments/{comment_id}", json={"text": "Edited comment"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["text"], "Edited comment")
        self.assertEqual(self.client.delete(f"/comments/{comment_id}").status_code, 200)

        self.assertEqual(self.client.post("/comments/", json={"post_id": "bad", "text": "x"}).status_code, 400)
        self.assertEqual(self.client.patch("/comments/bad", json={"text": "x"}).status_code, 400)

        foreign_id = ObjectId()
        self.comments.documents.append({"_id": foreign_id, "post_id": post_id, "user_id": str(self.other_id), "text": "Bob", "created_at": datetime.utcnow()})
        self.assertEqual(self.client.patch(f"/comments/{foreign_id}", json={"text": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/comments/{foreign_id}").status_code, 403)
        self.assertEqual(self.client.patch(f"/comments/{ObjectId()}", json={"text": "x"}).status_code, 404)
        self.assertEqual(self.client.patch(f"/comments/{comment_id}", json={}).status_code, 404)

    def test_comment_muting_and_violation_side_effects(self):
        future = datetime.utcnow() + timedelta(hours=1)
        self.behaviour.documents.append({"_id": ObjectId(), "user_id": self.user_id, "mute_until": future.isoformat()})
        response = self.client.post("/comments/", json={"post_id": str(ObjectId()), "text": "blocked"})
        self.assertEqual(response.status_code, 423)

        self.behaviour.documents.clear()
        self.stack.enter_context(patch.object(comments_routes, "check_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)))
        self.stack.enter_context(patch.object(comments_routes, "record_violation", new=AsyncMock(return_value={"warning_count": 1})))
        response = self.client.post("/comments/", json={"post_id": str(ObjectId()), "text": "you are stupid"})
        self.assertEqual(response.status_code, 200, response.text)
        stored = self.comments.documents[0]
        self.assertEqual(stored["moderation_status"], "toxic")
        self.assertTrue(stored["is_blurred"])
        self.assertEqual(self.notifications.documents[0]["title"], "Comment Flagged")

    def test_profiles_relationships_following_search_and_password_update(self):
        self.user["followers"] = [str(self.other_id)]
        self.user["following"] = [str(self.other_id)]
        self.other_user["followers"] = [str(self.user_id)]
        profile = self.client.get("/users/profile")
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertEqual(profile.json()["followers"], 1)
        self.assertNotIn("password", profile.json())

        public_profile = self.client.get(f"/users/profile/{self.other_id}")
        self.assertTrue(public_profile.json()["is_following"])
        followers = self.client.get(f"/users/profile/{self.other_id}/followers")
        self.assertEqual(followers.json()[0]["username"], "alice")
        following = self.client.get(f"/users/profile/{self.user_id}/following")
        self.assertEqual(following.json()[0]["username"], "bob")
        self.assertEqual(self.client.get("/users/profile/nope").status_code, 400)
        self.assertEqual(self.client.get(f"/users/profile/{ObjectId()}").status_code, 404)

        followed = self.client.post(f"/users/{self.other_id}/follow")
        self.assertEqual(followed.status_code, 200)
        self.assertEqual(self.client.post(f"/users/{self.user_id}/follow").status_code, 400)
        self.client.post(f"/users/{self.other_id}/unfollow")
        self.assertNotIn(str(self.user_id), self.other_user["followers"])

        results = self.client.get("/users/search?q=BOB")
        self.assertEqual(results.status_code, 200)
        self.assertEqual(results.json()[0]["username"], "bob")
        suggestions = self.client.get("/users/suggestions")
        self.assertTrue(all(item["id"] != str(self.user_id) for item in suggestions.json()))

        updated = self.client.put("/users/profile/update", json={"name": "A. Example", "bio": None})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "A. Example")
        bad_password = self.client.put("/users/profile/update", json={"password": "é" * 37})
        self.assertEqual(bad_password.status_code, 400)

    def test_notifications_are_scoped_and_read_state_updates(self):
        own = {"_id": ObjectId(), "user_id": self.user_id, "title": "Own", "message": "hello", "is_read": False, "created_at": datetime.utcnow()}
        foreign = {"_id": ObjectId(), "user_id": self.other_id, "title": "Other", "message": "hello", "is_read": False, "created_at": datetime.utcnow()}
        self.notifications.documents.extend([own, foreign])
        listed = self.client.get("/notifications/")
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(self.client.get("/notifications/unread-count").json()["unread_count"], 1)
        self.assertEqual(self.client.patch(f"/notifications/{own['_id']}/read").status_code, 200)
        self.assertEqual(self.client.get("/notifications/unread-count").json()["unread_count"], 0)
        self.assertEqual(self.client.patch(f"/notifications/{foreign['_id']}/read").status_code, 404)
        self.assertEqual(self.client.patch("/notifications/bad/read").status_code, 400)
        self.notifications.documents.append({"_id": ObjectId(), "user_id": self.user_id, "title": "New", "message": "x", "is_read": False, "created_at": datetime.utcnow()})
        self.assertEqual(self.client.patch("/notifications/read-all").status_code, 200)
        self.assertEqual(self.client.get("/notifications/unread-count").json()["unread_count"], 0)

    def test_chat_conversation_creation_inbox_unread_and_blocked_filtering(self):
        created = self.client.post("/chat/conversation", json={"user_id": str(self.other_id)})
        self.assertEqual(created.status_code, 200, created.text)
        conversation_id = created.json()["id"]
        reused = self.client.post("/chat/conversation", json={"user_id": str(self.other_id)})
        self.assertEqual(reused.json()["id"], conversation_id)
        self.assertEqual(self.client.post("/chat/conversation", json={}).status_code, 400)
        self.assertEqual(self.client.post("/chat/conversation", json={"user_id": "bad"}).status_code, 400)
        self.assertEqual(self.client.post("/chat/conversation", json={"user_id": str(self.user_id)}).status_code, 400)
        self.assertEqual(self.client.post("/chat/conversation", json={"user_id": str(ObjectId())}).status_code, 404)

        self.assertEqual(self.client.get("/chat/messages/bad").status_code, 400)
        self.assertEqual(self.client.get(f"/chat/messages/{ObjectId()}").status_code, 404)
        now = datetime.utcnow()
        self.messages.documents.extend([
            {"_id": ObjectId(), "conversation_id": conversation_id, "sender_id": str(self.other_id), "content": "Hello", "created_at": now, "is_read": False, "delivery_status": "delivered"},
            {"_id": ObjectId(), "conversation_id": conversation_id, "sender_id": str(self.other_id), "content": "blocked text", "created_at": now + timedelta(seconds=1), "is_read": False, "delivery_status": "blocked"},
        ])
        inbox = self.client.get("/chat/conversations")
        self.assertEqual(len(inbox.json()), 1)
        self.assertEqual(inbox.json()[0]["last_message"], "Hello")
        self.assertEqual(inbox.json()[0]["unread_count"], 1)
        message_list = self.client.get(f"/chat/messages/{conversation_id}")
        self.assertEqual([message["content"] for message in message_list.json()], ["Hello"])

    def test_analytics_aggregate_and_behaviour_endpoints(self):
        today = datetime.utcnow()
        author_comment = str(self.user_id)
        self.comments.documents.extend([
            {"_id": ObjectId(), "user_id": author_comment, "text": "safe", "moderation_status": "safe", "created_at": today},
            {"_id": ObjectId(), "user_id": author_comment, "text": "toxic", "moderation_status": "toxic", "created_at": today},
            {"_id": ObjectId(), "user_id": "invalid-id", "text": "pending", "moderation_status": "pending", "created_at": today},
        ])
        self.posts.documents.append({"_id": ObjectId(), "user_id": author_comment, "caption": "Post", "created_at": today})
        overview = self.client.get("/analytics/overview").json()
        self.assertEqual(overview["total_comments"], 3)
        self.assertEqual(overview["safe_comments"], 1)
        self.assertEqual(overview["toxic_comments"], 1)
        self.assertEqual(overview["unverified_comments"], 1)
        self.assertEqual(overview["today_violations"], 1)
        toxic = self.client.get("/analytics/toxic-comments").json()
        self.assertEqual(toxic[0]["user_name"], "alice")
        trend = self.client.get("/analytics/toxicity-trend").json()
        self.assertEqual(len(trend), 14)
        self.assertEqual(trend[-1]["toxic_count"], 1)

        empty_behaviour = self.client.get("/analytics/user-behaviour").json()
        self.assertEqual(empty_behaviour["warning_count"], 0)
        self.assertEqual(empty_behaviour["risk_score"], 0.0)


class ModerationRouteTests(PlatformApiTestCase):
    def test_text_check_empty_safe_and_toxic_results(self):
        self.stack.enter_context(patch.object(moderation_routes, "check_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)))
        toxic = self.client.post("/api/moderation/check-text", json={"text": "you are stupid"})
        self.assertEqual(toxic.status_code, 200, toxic.text)
        self.assertEqual(toxic.json()["severity"], "High")
        self.assertEqual(toxic.json()["categoryScores"]["insult"], 100)
        self.assertEqual(toxic.json()["highlightedWords"], ["stupid"])
        empty = self.client.post("/api/moderation/check-text", json={"text": "  "})
        self.assertEqual(empty.status_code, 400)

    def test_rewrite_missing_key_and_provider_error_responses(self):
        with patch.object(moderation_routes.settings, "GROQ_API_KEY", ""):
            missing_key = self.client.post("/api/moderation/rewrite", json={"text": "Please stop"})
        self.assertEqual(missing_key.status_code, 503)

        with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"):
            for provider_status, expected_status in ((404, 502), (429, 503), (401, 503), (500, 502)):
                provider = StubProviderClient(StubProviderResponse(provider_status, {"error": {"code": "model_not_found"}}))
                with patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider):
                    response = self.client.post("/api/moderation/rewrite", json={"text": "you are stupid"})
                self.assertEqual(response.status_code, expected_status)
                self.assertTrue(response.json()["detail"])
        self.assertEqual(self.client.post("/api/moderation/rewrite", json={"text": " "}).status_code, 400)

    def test_rewrite_validates_provider_payload_and_sanitizes_flagged_wording(self):
        provider = StubProviderClient(StubProviderResponse(200, {"choices": [{"message": {"content": "Please share your concern respectfully."}}]}))
        with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"), patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider):
            response = self.client.post("/api/moderation/rewrite", json={"text": "You are stupid", "tone": "calm"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["suggestion"], "Please share your concern respectfully.")
        sent_payload = provider.requests[0][1]["json"]
        self.assertIn("[stupid]", sent_payload["messages"][0]["content"])
        self.assertNotIn("You are stupid", sent_payload["messages"][0]["content"])

        invalid_payloads = [
            {"choices": []},
            {"choices": [{"message": {"content": " "}, "finish_reason": "length"}]},
        ]
        for payload in invalid_payloads:
            provider = StubProviderClient(StubProviderResponse(200, payload))
            with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"), patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider):
                response = self.client.post("/api/moderation/rewrite", json={"text": "Please stop"})
            self.assertEqual(response.status_code, 502)
        provider = StubProviderClient(StubProviderResponse(200, json_error=ValueError("bad json")))
        with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"), patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider):
            self.assertEqual(self.client.post("/api/moderation/rewrite", json={"text": "Please stop"}).status_code, 502)

    def test_rewrite_maps_timeout_and_network_failures(self):
        import httpx

        class FailingProvider(StubProviderClient):
            def __init__(self, failure):
                super().__init__(None)
                self.failure = failure

            async def post(self, *_args, **_kwargs):
                raise self.failure

        for error, expected_status in (
            (httpx.TimeoutException("timeout"), 504),
            (httpx.ConnectError("offline"), 502),
        ):
            provider = FailingProvider(error)
            with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"), patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider):
                response = self.client.post("/api/moderation/rewrite", json={"text": "Please stop"})
            self.assertEqual(response.status_code, expected_status)

    def test_image_ocr_validation_toxic_and_no_text_results(self):
        with patch.object(moderation_routes, "extract_text_from_image_data", new=AsyncMock(side_effect=ValueError("Invalid image data URI"))):
            invalid = self.client.post("/api/moderation/check-image", json={"image_data": "not-a-data-uri"})
        self.assertEqual(invalid.status_code, 400)

        with patch.object(moderation_routes, "extract_text_from_image_data", new=AsyncMock(side_effect=RuntimeError("Tesseract OCR is not installed"))):
            unavailable = self.client.post("/api/moderation/check-image", json={"image_data": "data:image/png;base64,YQ=="})
        self.assertEqual(unavailable.status_code, 503)

        with patch.object(moderation_routes, "extract_text_from_image_data", new=AsyncMock(return_value="you are stupid")), patch.object(moderation_routes, "check_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)):
            toxic = self.client.post("/api/moderation/check-image", json={"image_data": "data:image/png;base64,YQ=="})
        self.assertEqual(toxic.status_code, 200, toxic.text)
        self.assertTrue(toxic.json()["isToxic"])
        self.assertEqual(toxic.json()["detectedText"], "you are stupid")

        with patch.object(moderation_routes, "extract_text_from_image_data", new=AsyncMock(return_value="")):
            blank = self.client.post("/api/moderation/check-image", json={"image_data": "data:image/png;base64,YQ=="})
        self.assertEqual(blank.status_code, 200)
        self.assertFalse(blank.json()["isToxic"])
        self.assertEqual(blank.json()["score"], 0)

    def test_audio_upload_type_size_provider_and_transcript(self):
        wrong_type = self.client.post("/api/moderation/check-audio", files={"audio": ("note.txt", b"hello", "text/plain")})
        self.assertEqual(wrong_type.status_code, 400)
        empty = self.client.post("/api/moderation/check-audio", files={"audio": ("empty.wav", b"", "audio/wav")})
        self.assertEqual(empty.status_code, 413)

        provider = StubProviderClient(StubProviderResponse(200, {"text": "you are stupid"}))
        with patch.object(moderation_routes.settings, "GROQ_API_KEY", "test-key"), patch.object(moderation_routes.httpx, "AsyncClient", return_value=provider), patch.object(moderation_routes, "check_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)):
            result = self.client.post("/api/moderation/check-audio", files={"audio": ("voice.wav", b"voice", "audio/wav")})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["transcription"], "you are stupid")
        self.assertTrue(result.json()["isToxic"])
        self.assertIn("file", provider.requests[0][1]["files"])

        with patch.object(moderation_routes.settings, "GROQ_API_KEY", ""):
            no_key = self.client.post("/api/moderation/check-audio", files={"audio": ("voice.wav", b"voice", "audio/wav")})
        self.assertEqual(no_key.status_code, 503)


class WebSocketRouteTests(PlatformApiTestCase):
    def test_valid_message_is_stored_and_delivered_to_both_participants(self):
        conversation_id = ObjectId()
        self.conversations.documents.append({"_id": conversation_id, "participants": [str(self.user_id), str(self.other_id)]})
        with patch.object(websocket_routes, "get_user_from_token", new=AsyncMock(return_value=self.user)), self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({
                "event": "send_message", "conversation_id": str(conversation_id),
                "sender_id": str(self.user_id), "receiver_id": str(self.other_id),
                "client_message_id": "client-1", "content": "Hello there",
            })
            event = socket.receive_json()
        self.assertEqual(event["type"], "new_message")
        self.assertEqual(event["content"], "Hello there")
        self.assertEqual(event["client_message_id"], "client-1")
        self.assertEqual(self.messages.documents[0]["delivery_status"], "delivered")

    def test_toxic_message_requires_confirmation_and_blocked_attempt_hides_text(self):
        conversation_id = ObjectId()
        self.conversations.documents.append({"_id": conversation_id, "participants": [str(self.user_id), str(self.other_id)]})
        with patch.object(websocket_routes, "check_chat_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)), self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "you are stupid", "client_message_id": "warn-1"})
            warning = socket.receive_json()
        self.assertEqual(warning["type"], "toxicity_warning")
        self.assertEqual(warning["highlighted_words"], ["stupid"])
        self.assertEqual(self.messages.documents[0]["delivery_status"], "blocked")
        self.assertNotIn("content", self.messages.documents[0])

    def test_websocket_rejects_bad_token_and_invalid_message_fields(self):
        with patch.object(websocket_routes, "get_user_from_token", new=AsyncMock(return_value=None)):
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect("/ws/notifications?token=bad"):
                    pass

        conversation_id = ObjectId()
        self.conversations.documents.append({"_id": conversation_id, "participants": [str(self.user_id), str(self.other_id)]})
        with self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "  "})
            empty = socket.receive_json()
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "hello", "sender_id": str(self.other_id)})
            mismatch = socket.receive_json()
            socket.send_json({"event": "send_message", "conversation_id": str(ObjectId()), "content": "hello"})
            invalid_conversation = socket.receive_json()
        self.assertEqual(empty["code"], "empty_message")
        self.assertEqual(mismatch["code"], "sender_mismatch")
        self.assertEqual(invalid_conversation["code"], "invalid_conversation")

    def test_websocket_warning_override_mute_limit_and_message_size(self):
        conversation_id = ObjectId()
        self.conversations.documents.append({"_id": conversation_id, "participants": [str(self.user_id), str(self.other_id)]})
        with patch.object(websocket_routes, "check_chat_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)), self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "you are stupid", "ignore_warning": True, "client_message_id": "override"})
            delivered = socket.receive_json()
        self.assertEqual(delivered["type"], "new_message")
        self.assertTrue(delivered["user_override"])
        self.assertEqual(self.messages.documents[0]["delivery_status"], "delivered")

        self.messages.documents.clear()
        with patch.object(websocket_routes, "record_violation", new=AsyncMock(return_value={"warning_count": 3})), patch.object(websocket_routes, "check_chat_toxicity", new=AsyncMock(return_value=TOXIC_RESULT)), self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "you are stupid", "ignore_warning": True, "client_message_id": "third"})
            muted = socket.receive_json()
        self.assertEqual(muted["type"], "message_error")
        self.assertEqual(muted["code"], "account_muted")
        self.assertEqual(self.messages.documents[0]["delivery_status"], "blocked")

        with patch.object(websocket_routes, "is_muted", new=AsyncMock(return_value=True)), self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "hello"})
            account_muted = socket.receive_json()
        self.assertEqual(account_muted["code"], "account_muted")

        with self.client.websocket_connect("/ws/notifications?token=valid") as socket:
            socket.send_json({"event": "send_message", "conversation_id": str(conversation_id), "content": "x" * 5001})
            too_long = socket.receive_json()
        self.assertEqual(too_long["code"], "message_too_long")


if __name__ == "__main__":
    unittest.main()
