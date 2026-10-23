"""Small in-memory MongoDB stand-ins for isolated route and service tests."""

from __future__ import annotations

import copy
import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any

from bson import ObjectId


def _same(left: Any, right: Any) -> bool:
    if isinstance(left, ObjectId) and isinstance(right, str):
        return str(left) == right
    if isinstance(right, ObjectId) and isinstance(left, str):
        return left == str(right)
    return left == right


def _matches_value(actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict) and any(str(key).startswith("$") for key in expected):
        for operator, value in expected.items():
            if operator == "$in":
                candidates = actual if isinstance(actual, list) else [actual]
                if not any(any(_same(item, option) for option in value) for item in candidates):
                    return False
            elif operator == "$nin":
                candidates = actual if isinstance(actual, list) else [actual]
                if any(any(_same(item, option) for option in value) for item in candidates):
                    return False
            elif operator == "$ne":
                candidates = actual if isinstance(actual, list) else [actual]
                if any(_same(item, value) for item in candidates):
                    return False
            elif operator == "$gte":
                if actual is None or actual < value:
                    return False
            elif operator == "$regex":
                flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                if actual is None or re.search(value, str(actual), flags) is None:
                    return False
            elif operator == "$all":
                if not isinstance(actual, list) or not all(
                    any(_same(item, wanted) for item in actual) for wanted in value
                ):
                    return False
            elif operator == "$size":
                if not isinstance(actual, list) or len(actual) != value:
                    return False
            elif operator == "$options":
                continue
            else:
                raise NotImplementedError(f"Fake Mongo operator not supported: {operator}")
        return True

    if isinstance(actual, list) and not isinstance(expected, list):
        return any(_same(item, expected) for item in actual)
    return _same(actual, expected)


def matches(document: dict[str, Any], query: dict[str, Any] | None) -> bool:
    query = query or {}
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, option) for option in expected):
                return False
        elif key == "$and":
            if not all(matches(document, option) for option in expected):
                return False
        elif not _matches_value(document.get(key), expected):
            return False
    return True


def _project(document: dict[str, Any], projection: dict[str, Any] | None) -> dict[str, Any]:
    if not projection:
        return copy.deepcopy(document)
    included = {key for key, value in projection.items() if value}
    excluded = {key for key, value in projection.items() if not value}
    if included:
        result = {key: copy.deepcopy(document[key]) for key in included if key in document}
        if "_id" not in excluded and "_id" in document:
            result["_id"] = copy.deepcopy(document["_id"])
        return result
    return {key: copy.deepcopy(value) for key, value in document.items() if key not in excluded}


class FakeCursor:
    def __init__(self, documents: list[dict[str, Any]]):
        self.documents = copy.deepcopy(documents)
        self.offset = 0
        self.maximum: int | None = None

    def sort(self, field: str | list[tuple[str, int]], direction: int | None = None):
        fields = field if isinstance(field, list) else [(field, direction or 1)]
        for name, order in reversed(fields):
            self.documents.sort(
                key=lambda item: (item.get(name) is not None, item.get(name)),
                reverse=order < 0,
            )
        return self

    def skip(self, count: int):
        self.offset = count
        return self

    def limit(self, count: int):
        self.maximum = count
        return self

    async def to_list(self, length: int | None = None):
        stop = self.maximum
        if length is not None:
            stop = length if stop is None else min(stop, length)
        result = self.documents[self.offset :]
        if stop is not None:
            result = result[:stop]
        return copy.deepcopy(result)


class FakeCollection:
    def __init__(self, documents: list[dict[str, Any]] | None = None, database=None):
        self.documents = copy.deepcopy(documents or [])
        self.database = database

    async def create_index(self, *_args, **_kwargs):
        return "fake_index"

    async def find_one(self, query=None, projection=None):
        document = next((d for d in self.documents if matches(d, query)), None)
        return _project(document, projection) if document is not None else None

    def find(self, query=None, projection=None):
        documents = [_project(d, projection) for d in self.documents if matches(d, query)]
        return FakeCursor(documents)

    async def insert_one(self, document):
        saved = copy.deepcopy(document)
        saved.setdefault("_id", ObjectId())
        self.documents.append(saved)
        return SimpleNamespace(inserted_id=saved["_id"])

    async def update_one(self, query, update, upsert=False):
        document = next((d for d in self.documents if matches(d, query)), None)
        is_insert = document is None
        if document is None and upsert:
            document = {key: value for key, value in query.items() if not key.startswith("$")}
            document["_id"] = ObjectId()
            self.documents.append(document)
        if document is None:
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)
        self._apply_update(document, update, is_insert=is_insert)
        return SimpleNamespace(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query, update):
        matched = [d for d in self.documents if matches(d, query)]
        for document in matched:
            self._apply_update(document, update)
        return SimpleNamespace(matched_count=len(matched), modified_count=len(matched))

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if matches(document, query):
                self.documents.pop(index)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def find_one_and_delete(self, query):
        for index, document in enumerate(self.documents):
            if matches(document, query):
                return copy.deepcopy(self.documents.pop(index))
        return None

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        document = next((d for d in self.documents if matches(d, query)), None)
        is_insert = document is None
        if is_insert and upsert:
            document = {key: copy.deepcopy(value) for key, value in query.items() if not key.startswith("$")}
            document["_id"] = ObjectId()
            self.documents.append(document)
        if document is None:
            return None
        self._apply_update(document, update, is_insert=is_insert)
        return copy.deepcopy(document)

    async def count_documents(self, query=None):
        return sum(1 for document in self.documents if matches(document, query))

    def aggregate(self, pipeline):
        documents = copy.deepcopy(self.documents)
        group_stage = None
        for stage in pipeline:
            if "$match" in stage:
                documents = [d for d in documents if matches(d, stage["$match"])]
            elif "$group" in stage:
                group_stage = stage["$group"]
        if group_stage is not None:
            grouped: dict[tuple[str, str], int] = {}
            for document in documents:
                created_at = document.get("created_at")
                status = document.get("moderation_status")
                if not isinstance(created_at, datetime):
                    continue
                group_key = (created_at.strftime("%Y-%m-%d"), status)
                grouped[group_key] = grouped.get(group_key, 0) + 1
            documents = [
                {"_id": {"date": date, "status": status}, "count": count}
                for (date, status), count in grouped.items()
            ]
        return FakeCursor(documents)

    @staticmethod
    def _apply_update(document, update, is_insert=False):
        if not any(str(key).startswith("$") for key in update):
            document.clear()
            document.update(copy.deepcopy(update))
            return
        for key, values in update.items():
            if key == "$set":
                document.update(copy.deepcopy(values))
            elif key == "$setOnInsert":
                if is_insert:
                    for name, value in values.items():
                        document.setdefault(name, copy.deepcopy(value))
            elif key == "$inc":
                for name, value in values.items():
                    document[name] = document.get(name, 0) + value
            elif key == "$addToSet":
                for name, value in values.items():
                    array = document.setdefault(name, [])
                    if value not in array:
                        array.append(copy.deepcopy(value))
            elif key == "$pull":
                for name, value in values.items():
                    document[name] = [item for item in document.get(name, []) if item != value]
            else:
                raise NotImplementedError(f"Fake Mongo update operator not supported: {key}")


class FakeDatabase:
    def __init__(self):
        self.collections: dict[str, FakeCollection] = {}

    def __getitem__(self, name: str):
        if name not in self.collections:
            self.collections[name] = FakeCollection(database=self)
        return self.collections[name]
