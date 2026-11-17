"""Document store. Memory is the default. PyMongo is used only when MONGO_URL is set."""

from __future__ import annotations

import uuid
from typing import Protocol

COLLECTIONS = (
    "activity_events",
    "parent_communication_logs",
    "ai_interaction_logs",
    "student_learning_observations",
    "integration_webhook_events",
    "notification_payloads",
    "document_processing_metadata",
)

# Declared indexes (field, direction). Memory store records them; PyMongo creates them.
INDEXES: dict[str, list[tuple[str, int]]] = {
    "activity_events": [("school_id", 1), ("occurred_at", -1), ("event_type", 1)],
    "parent_communication_logs": [("school_id", 1), ("student_id", 1), ("dedupe_key", 1)],
    "ai_interaction_logs": [("school_id", 1), ("student_id", 1), ("created_at", -1)],
    "student_learning_observations": [("school_id", 1), ("student_id", 1), ("created_at", -1)],
    "integration_webhook_events": [("school_id", 1), ("provider", 1), ("idempotency_key", 1)],
    "notification_payloads": [("school_id", 1), ("dedupe_key", 1), ("created_at", -1)],
    "document_processing_metadata": [("school_id", 1), ("document_type", 1), ("created_at", -1)],
}


class DocumentStore(Protocol):
    indexes: dict[str, list[tuple[str, int]]]

    def insert(self, collection: str, document: dict) -> str: ...

    def find(self, collection: str, query: dict | None = None) -> list[dict]: ...


class MemoryDocumentStore:
    """Process-local store used in tests and whenever MONGO_URL is unset."""

    def __init__(self) -> None:
        self.collections: dict[str, list[dict]] = {name: [] for name in COLLECTIONS}
        self.indexes = {name: list(INDEXES[name]) for name in COLLECTIONS}

    def insert(self, collection: str, document: dict) -> str:
        if collection not in self.collections:
            raise KeyError(f"unknown collection {collection}")
        key = document.get("dedupe_key")
        if key:
            for existing in self.collections[collection]:
                if existing.get("dedupe_key") == key:
                    return existing["_id"]
        stored = dict(document)
        stored.setdefault("_id", str(uuid.uuid4()))
        self.collections[collection].append(stored)
        return stored["_id"]

    def find(self, collection: str, query: dict | None = None) -> list[dict]:
        if collection not in self.collections:
            raise KeyError(f"unknown collection {collection}")
        query = query or {}
        rows = []
        for row in self.collections[collection]:
            if all(row.get(field) == value for field, value in query.items()):
                rows.append(row)
        return rows


class PyMongoDocumentStore:
    def __init__(self, url: str, db_name: str = "edunexus") -> None:
        import pymongo

        self.indexes = {name: list(INDEXES[name]) for name in COLLECTIONS}
        self.client = pymongo.MongoClient(url, serverSelectionTimeoutMS=2000)
        self.db = self.client[db_name]
        self.ensure_indexes()

    def ensure_indexes(self) -> None:
        for collection, indexes in self.indexes.items():
            for field, direction in indexes:
                self.db[collection].create_index([(field, direction)])

    def insert(self, collection: str, document: dict) -> str:
        if collection not in COLLECTIONS:
            raise KeyError(f"unknown collection {collection}")
        key = document.get("dedupe_key")
        if key:
            existing = self.db[collection].find_one({"dedupe_key": key})
            if existing:
                return str(existing["_id"])
        stored = dict(document)
        result = self.db[collection].insert_one(stored)
        return str(result.inserted_id)

    def find(self, collection: str, query: dict | None = None) -> list[dict]:
        if collection not in COLLECTIONS:
            raise KeyError(f"unknown collection {collection}")
        rows = []
        for row in self.db[collection].find(query or {}):
            row["_id"] = str(row["_id"])
            rows.append(row)
        return rows


def build_document_store(mongo_url: str | None, mongo_db: str) -> MemoryDocumentStore | PyMongoDocumentStore:
    if mongo_url:
        return PyMongoDocumentStore(mongo_url, mongo_db)
    return MemoryDocumentStore()
