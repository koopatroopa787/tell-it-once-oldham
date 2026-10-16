"""Offline tests for the website API. No API key needed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api
from test_matcher import FakeClient

client = TestClient(api.app)


@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    fake = FakeClient(["vol-dofe", "made-up"])
    monkeypatch.setattr(api.matcher, "_client", fake)
    return fake


def test_questions_cover_both_paths() -> None:
    body = client.get("/api/questions").json()
    assert set(body["paths"]) == {"student", "explore"}
    assert set(body["questions"]) == set(body["paths"])
    assert set(body["opportunity_types"]) == {"voluntary", "paid_work", "social_work"}


def test_match_returns_contact_details_and_drops_unknown_ids(fake_model: FakeClient) -> None:
    response = client.post(
        "/api/match",
        json={"path": "student", "type": "voluntary", "hobbies": "football, call 07700 900123", "district": "East"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [m["id"] for m in body["matches"]] == ["vol-dofe"]
    assert body["matches"][0]["name"] and body["used_ai"] and body["crisis"] is None
    assert "07700" not in fake_model.sent


def test_match_falls_back_without_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api.matcher, "_client", object())  # any call fails
    body = client.post("/api/match", json={"path": "explore", "type": "social_work"}).json()
    assert body["matches"] and not body["used_ai"]


def test_crisis_information_is_shown(fake_model: FakeClient) -> None:
    body = client.post(
        "/api/match", json={"path": "explore", "type": "voluntary", "interests": "I want to end my life"}
    ).json()
    assert body["crisis"]["message"]


@pytest.mark.parametrize(
    "payload",
    [
        {"path": "student"},
        {"path": "nope", "type": "voluntary"},
        {"path": "student", "type": "voluntary", "district": "Atlantis"},
        {"path": "student", "type": "voluntary", "hobbies": "x" * 1001},
        {"path": "student", "type": "voluntary", "name": "Sam"},
    ],
)
def test_bad_input_is_rejected(payload: dict) -> None:
    assert client.post("/api/match", json=payload).status_code == 422
