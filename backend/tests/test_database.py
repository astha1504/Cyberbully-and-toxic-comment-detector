import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app import database


class DatabaseIndexTests(unittest.IsolatedAsyncioTestCase):
    async def test_startup_creates_named_query_indexes_without_a_database_server(self):
        names = (
            "users_collection", "posts_collection", "comments_collection",
            "notifications_collection", "conversations_collection", "messages_collection",
            "user_behaviour_collection",
        )
        replacements = {}
        for name in names:
            replacements[name] = SimpleNamespace(create_index=AsyncMock())
        with patch.multiple(database, **replacements):
            await database.ensure_indexes()

        calls = [
            call
            for collection in replacements.values()
            for call in collection.create_index.await_args_list
        ]
        self.assertEqual(len(calls), 12)
        index_names = {call.kwargs["name"] for call in calls}
        self.assertIn("users_username", index_names)
        self.assertIn("messages_unread", index_names)
        self.assertIn("notifications_unread", index_names)
        self.assertEqual(len(index_names), 12)


if __name__ == "__main__":
    unittest.main()
