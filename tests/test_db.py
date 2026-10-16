"""What gets stored: matches, chat turns and documents, with personal details already removed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api
import documents
from db import Database, session_id
from test_matcher import FakeClient, _analysis

client = TestClient(api.app)
VISIT = {"X-Pathly-Session": "3f2b8c1e-visit-0001"}


@pytest.fixture(autouse=True)
def offline_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """Never call the real model from these tests, even on the server where a key is set."""
    fake = FakeClient(_analysis([{"opportunity_id": "vol-dofe", "why": "w", "first_step": "s", "barrier_tip": "t"}]))
    monkeypatch.setattr(api.matcher, "_client", fake)


def test_match_is_stored_without_personal_details(temp_db: Database) -> None:
    body = {"path": "explore", "type": "voluntary", "district": "North", "interests": "football, call me on 07700 900123"}
    assert client.post("/api/match", json=body, headers=VISIT).status_code == 200
    [row] = temp_db.rows("matches")
    assert row["session"] == VISIT["X-Pathly-Session"] and "07700" not in row["answers"] and "[PHONE]" in row["answers"]
    assert '"matches"' in row["result"]


def test_document_is_stored_redacted(temp_db: Database) -> None:
    client.post("/api/read-doc", content=b"Sam Jones\nsam@example.com\nWorked in a shop", headers={"Content-Type": documents.TEXT, **VISIT})
    [row] = temp_db.rows("documents")
    assert "Sam" not in row["text"] and "sam@" not in row["text"] and "shop" in row["text"]


def test_chat_turn_is_stored(temp_db: Database, monkeypatch) -> None:
    monkeypatch.setattr(api, "chat_limiter", api.RateLimiter(100, 600))
    body = {"answers": {"path": "explore", "type": "voluntary"}, "matched_opportunity_ids": ["vol-dofe"], "message": "email me at a@b.com"}
    assert client.post("/api/chat", json=body, headers=VISIT).status_code == 200
    [row] = temp_db.rows("chats")
    assert "a@b.com" not in row["message"] and row["reply"]


def test_bad_session_ids_are_ignored() -> None:
    assert session_id("abc") is None and session_id("x" * 65) is None and session_id("'; drop table--") is None
    assert session_id("3f2b8c1e-visit-0001") == "3f2b8c1e-visit-0001"
