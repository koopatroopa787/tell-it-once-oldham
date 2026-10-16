"""Offline tests for the website API. No API key needed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api
from test_matcher import FakeClient, _analysis
from voice import RateLimiter

client = TestClient(api.app)


@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    fake = FakeClient(_analysis([
        {"opportunity_id": "vol-dofe", "why": "w", "first_step": "s", "barrier_tip": "Ask about kit you can borrow."},
        {"opportunity_id": "made-up", "why": "w", "first_step": "s", "barrier_tip": "t"},
    ]))
    monkeypatch.setattr(api.matcher, "_client", fake)
    monkeypatch.setattr(api, "chat_limiter", RateLimiter(100, 600))
    return fake


def _sent(fake: FakeClient) -> str:
    return str(fake.calls[-1]["messages"])


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
    assert body["matches"][0]["barrier_tip"] == "Ask about kit you can borrow."
    assert body["summary"] and body["possible_directions"]
    assert "07700" not in _sent(fake_model)


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


def test_chat_answers_about_the_shown_matches(fake_model: FakeClient) -> None:
    fake_model.payload = {"reply": "DofE could suit you.", "referenced_opportunity_ids": ["vol-dofe", "made-up"],
                          "suggested_questions": ["How long does it take?"], "needs_human_support": False}
    response = client.post("/api/chat", json={
        "answers": {"path": "student", "type": "voluntary"},
        "matched_opportunity_ids": ["vol-dofe"],
        "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello"}],
        "message": "Which is best? Text me on 07700 900123",
    })
    body = response.json()
    assert response.status_code == 200 and body["used_ai"]
    assert body["referenced_opportunity_ids"] == ["vol-dofe"]
    assert "07700" not in _sent(fake_model)


def test_chat_rejects_bad_input(fake_model: FakeClient) -> None:
    base = {"answers": {"path": "student", "type": "voluntary"}, "matched_opportunity_ids": ["vol-dofe"], "message": "hi"}
    assert client.post("/api/chat", json={**base, "message": ""}).status_code == 422
    assert client.post("/api/chat", json={**base, "history": [{"role": "system", "content": "x"}]}).status_code == 422
    assert client.post("/api/chat", json={**base, "matched_opportunity_ids": ["a"] * 6}).status_code == 422


def test_chat_is_rate_limited(fake_model: FakeClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "chat_limiter", RateLimiter(1, 600))
    body = {"answers": {"path": "student", "type": "voluntary"}, "matched_opportunity_ids": ["vol-dofe"], "message": "hi"}
    assert [client.post("/api/chat", json=body).status_code for _ in range(2)] == [200, 429]
