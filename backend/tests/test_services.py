import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import torch
from bson import ObjectId
from pydantic import ValidationError

from app.models.social import PostCreate
from app.models.user import UserCreate
from app.services import (
    auth_service,
    context_service,
    image_ocr,
    moderation_service,
    user_behaviour_service,
    websocket_manager,
)
from tests.fakes import FakeCollection


class AuthAndModelTests(unittest.TestCase):
    def test_bcrypt_passwords_support_long_input_by_truncating_at_byte_limit(self):
        password = "a" * 72 + "é"
        digest = auth_service.get_password_hash(password)
        self.assertTrue(auth_service.verify_password("a" * 72 + "x", digest))
        self.assertFalse(auth_service.verify_password("different", digest))

    def test_user_schema_counts_utf8_bytes_and_post_limits_images(self):
        valid = UserCreate(username="alice", email="alice@example.com", password="é" * 36)
        self.assertEqual(valid.username, "alice")
        with self.assertRaises(ValidationError):
            UserCreate(username="alice", email="alice@example.com", password="é" * 37)
        with self.assertRaises(ValidationError):
            PostCreate(caption="Too many", images=["x"] * 6)

    def test_access_token_contains_subject_and_expiry(self):
        token = auth_service.create_access_token({"sub": "alice"}, timedelta(minutes=5))
        from jose import jwt
        from app.config import settings

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        self.assertEqual(payload["sub"], "alice")
        self.assertGreater(payload["exp"], datetime.utcnow().timestamp())


class ModerationServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_keyword_matching_uses_boundaries_and_returns_unique_spans(self):
        matches = moderation_service.find_keyword_matches("Stupid, stupid! the word dumbness is different")
        self.assertEqual(matches, ["Stupid", "stupid"])
        self.assertEqual(moderation_service.find_keyword_matches("This is a classic"), [])

    def test_category_signals_cover_insult_harassment_threat_and_safe_text(self):
        insult = moderation_service.get_category_scores("You are stupid")
        harassment = moderation_service.get_category_scores("Nobody likes you, go away")
        threat = moderation_service.get_category_scores("I'll hurt you")
        safe = moderation_service.get_category_scores("We can disagree respectfully")
        self.assertEqual(insult, {"insult": 100, "harassment": 100, "threat": 0})
        self.assertEqual(harassment["harassment"], 100)
        self.assertEqual(threat["threat"], 100)
        self.assertEqual(safe, {"insult": 0, "harassment": 0, "threat": 0})

    async def test_check_toxicity_prioritizes_phrase_matches_and_marks_model_fallback(self):
        with patch.object(moderation_service, "_ensure_model_loaded", new=AsyncMock()), patch.object(moderation_service, "_model_available", False):
            toxic = await moderation_service.check_toxicity("Nobody likes you")
            safe = await moderation_service.check_toxicity("A respectful suggestion")
        self.assertTrue(toxic["is_toxic"])
        self.assertEqual(toxic["source"], "keyword_match")
        self.assertEqual(toxic["highlighted_words"], ["Nobody likes you"])
        self.assertFalse(safe["is_toxic"])
        self.assertEqual(safe["source"], "fallback")

    def test_model_inference_returns_calibrated_shape_and_highlights(self):
        tokenizer = lambda *_args, **_kwargs: {"input_ids": torch.tensor([[1, 2]])}
        model = lambda **_kwargs: SimpleNamespace(logits=torch.tensor([[0.0, 2.0]]))
        with patch.object(moderation_service, "_tokenizer", tokenizer), patch.object(moderation_service, "_model", model), patch.object(moderation_service, "_id2label", {"0": "safe", "1": "toxic"}):
            result = moderation_service._run_model_inference("You are stupid")
        self.assertTrue(result["is_toxic"])
        self.assertEqual(result["source"], "ml_model")
        self.assertEqual(result["label"], "toxic")
        self.assertAlmostEqual(result["score"], 0.8808, places=3)
        self.assertEqual(result["highlighted_words"], ["stupid"])

    async def test_context_moderation_counts_only_recent_sender_violations(self):
        sender_id = ObjectId("65b000000000000000000001")
        receiver_id = ObjectId("65b000000000000000000002")
        messages = FakeCollection([
            {"_id": ObjectId(), "conversation_id": "conversation", "sender_id": str(sender_id), "is_toxic": True, "created_at": datetime.utcnow() - timedelta(minutes=i)}
            for i in range(6)
        ] + [
            {"_id": ObjectId(), "conversation_id": "conversation", "sender_id": str(receiver_id), "is_toxic": True, "created_at": datetime.utcnow() + timedelta(minutes=1)},
        ])
        users = FakeCollection([{"_id": sender_id, "friends": [str(receiver_id)]}])
        with patch.object(moderation_service, "messages_collection", messages), patch.object(moderation_service, "users_collection", users), patch.object(moderation_service, "_ensure_model_loaded", new=AsyncMock()), patch.object(moderation_service, "_model_available", False):
            result = await moderation_service.check_chat_toxicity("you are stupid", str(sender_id), str(receiver_id), "conversation")
        self.assertTrue(result["is_toxic"])
        self.assertEqual(result["label"], "suppression_pattern")
        self.assertTrue(result["context"]["is_friend"])
        self.assertEqual(result["context"]["recent_messages_considered"], 7)
        self.assertEqual(result["context"]["toxic_messages_from_sender"], 6)
        self.assertEqual(result["score"], 1.0)
        self.assertTrue(result["warning"])

    async def test_chat_safe_message_falls_back_without_model(self):
        sender_id = ObjectId()
        receiver_id = ObjectId()
        with patch.object(moderation_service, "messages_collection", FakeCollection()), patch.object(moderation_service, "users_collection", FakeCollection()), patch.object(moderation_service, "_ensure_model_loaded", new=AsyncMock()), patch.object(moderation_service, "_model_available", False):
            result = await moderation_service.check_chat_toxicity("Thanks for the update", str(sender_id), str(receiver_id))
        self.assertFalse(result["is_toxic"])
        self.assertEqual(result["source"], "fallback")
        self.assertIsNone(result["warning"])


class ContextServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_context_returns_oldest_first_and_caps_at_ten(self):
        conversation = "conv-1"
        rows = [
            {"_id": ObjectId(), "conversation_id": conversation, "sender_id": "alice", "content": str(index), "is_toxic": index % 2 == 0, "created_at": datetime(2026, 1, 1) + timedelta(minutes=index)}
            for index in range(12)
        ]
        with patch.object(context_service, "messages_collection", FakeCollection(rows)):
            messages = await context_service.get_conversation_context(conversation, limit=10)
            summary = await context_service.compute_context_score(conversation)
        self.assertEqual([message["content"] for message in messages], ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"])
        self.assertEqual(summary["toxic_message_count"], 5)
        self.assertEqual(summary["context_score"], 0.5)
        self.assertEqual(summary["label"], "suppression_pattern")

    def test_context_prompt_marks_toxic_sender_and_current_text(self):
        prompt = context_service.build_context_prompt([
            {"sender_id": "alice", "content": "Hello", "is_toxic": False},
            {"sender_id": "bob", "content": "bad wording", "is_toxic": True},
        ], "Current message", "alice")
        self.assertIn("User : Hello", prompt)
        self.assertIn("Other [TOXIC]: bad wording", prompt)
        self.assertTrue(prompt.endswith("Current User: Current message"))


class BehaviourServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.user_id = str(ObjectId())
        self.collection = FakeCollection()
        self.patch = patch.object(user_behaviour_service, "user_behaviour_collection", self.collection)
        self.patch.start()
        self.addAsyncCleanup(self.patch.stop)

    async def test_warnings_trigger_24_hour_mute_on_third_and_update_risk(self):
        first = await user_behaviour_service.record_violation(self.user_id, 0.4)
        second = await user_behaviour_service.record_violation(self.user_id, 0.7)
        third = await user_behaviour_service.record_violation(self.user_id, 1.5)
        self.assertEqual(first["warning_count"], 1)
        self.assertIsNone(first["mute_until"])
        self.assertEqual(second["warning_count"], 2)
        self.assertIsNone(second["mute_until"])
        self.assertEqual(third["warning_count"], 3)
        self.assertLessEqual(third["toxicity_score"], 1)
        self.assertEqual(third["last_toxicity_score"], 1.0)
        mute_end = datetime.fromisoformat(third["mute_until"])
        self.assertGreater(mute_end, datetime.now(timezone.utc) + timedelta(hours=23, minutes=59))
        self.assertTrue(await user_behaviour_service.is_muted(self.user_id))

    async def test_get_or_create_edit_and_expired_mute(self):
        initial = await user_behaviour_service.get_or_create_behaviour(self.user_id)
        self.assertEqual(initial["warning_count"], 0)
        edited = await user_behaviour_service.record_edit(self.user_id)
        self.assertEqual(edited["edited_comments"], 1)
        self.assertFalse(await user_behaviour_service.is_muted("bad-user-id"))
        self.collection.documents[0]["mute_until"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        self.assertFalse(await user_behaviour_service.is_muted(self.user_id))
        with self.assertRaises(ValueError):
            await user_behaviour_service.get_or_create_behaviour("bad-user-id")


class ImageOcrTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_non_data_uri_mime_and_invalid_base64(self):
        for value in ("https://example.com/image.png", "data:image/svg+xml;base64,AA==", "data:image/png;base64,@@"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                await image_ocr.extract_text_from_image_data(value)

    async def test_ocr_calls_tesseract_with_validated_temp_image(self):
        process = SimpleNamespace(
            returncode=0,
            communicate=AsyncMock(return_value=(b"detected words\n", b"")),
            kill=Mock(),
            wait=AsyncMock(),
        )
        command = AsyncMock(return_value=process)
        with patch.dict(image_ocr.os.environ, {"TESSERACT_LANG": "eng+hin"}), patch.object(image_ocr, "_tesseract_command", return_value="tesseract"), patch.object(image_ocr.asyncio, "create_subprocess_exec", command):
            text = await image_ocr.extract_text_from_image_data("data:image/png;base64,YWJj")
        self.assertEqual(text, "detected words")
        self.assertEqual(command.await_args.args[0], "tesseract")
        self.assertTrue(command.await_args.args[1].endswith(".png"))
        self.assertEqual(command.await_args.args[2:], ("stdout", "-l", "eng+hin", "--psm", "6"))

    async def test_ocr_handles_missing_executable_failure_and_timeout(self):
        with patch.object(image_ocr, "_tesseract_command", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "not installed"):
                await image_ocr.extract_text_from_image_data("data:image/png;base64,YQ==")

        failed = SimpleNamespace(returncode=1, communicate=AsyncMock(return_value=(b"", b"fail")), kill=Mock(), wait=AsyncMock())
        with patch.object(image_ocr, "_tesseract_command", return_value="tesseract"), patch.object(image_ocr.asyncio, "create_subprocess_exec", AsyncMock(return_value=failed)):
            with self.assertRaisesRegex(RuntimeError, "could not read"):
                await image_ocr.extract_text_from_image_data("data:image/png;base64,YQ==")

        timeout = SimpleNamespace(returncode=None, communicate=AsyncMock(side_effect=asyncio.TimeoutError), kill=Mock(), wait=AsyncMock())
        with patch.object(image_ocr, "_tesseract_command", return_value="tesseract"), patch.object(image_ocr.asyncio, "create_subprocess_exec", AsyncMock(return_value=timeout)):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                await image_ocr.extract_text_from_image_data("data:image/png;base64,YQ==")
        timeout.kill.assert_called_once()
        timeout.wait.assert_awaited_once()


class WebSocketManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_connect_send_and_disconnect_clean_up_connections(self):
        manager = websocket_manager.ConnectionManager()

        class Socket:
            def __init__(self):
                self.accepted = False
                self.events = []

            async def accept(self):
                self.accepted = True

            async def send_json(self, payload):
                self.events.append(payload)

        socket = Socket()
        await manager.connect(socket, "user-1")
        await manager.send_personal_message({"type": "hello"}, "user-1")
        self.assertTrue(socket.accepted)
        self.assertEqual(socket.events, [{"type": "hello"}])
        manager.disconnect(socket, "user-1")
        self.assertNotIn("user-1", manager.active_connections)

    async def test_failed_connection_send_does_not_crash_broadcast(self):
        manager = websocket_manager.ConnectionManager()

        class BrokenSocket:
            async def accept(self):
                return None

            async def send_json(self, _payload):
                raise RuntimeError("closed")

        socket = BrokenSocket()
        await manager.connect(socket, "user-1")
        await manager.send_personal_message({"type": "ignored"}, "user-1")
        manager.disconnect(socket, "user-1")
        self.assertEqual(manager.active_connections, {})


if __name__ == "__main__":
    unittest.main()
