"""Mainstream services by age, situation and Universal Credit: fixed rules, never the AI."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api
import routes
from test_matcher import FakeClient, _analysis

client = TestClient(api.app)


def _status(*args: str) -> dict[str, str]:
    return {r["name"]: r["status"] for r in routes.find(*args)}


def test_graduate_in_a_shop_job_still_gets_careers_advice() -> None:
    got = _status("22_24", "underemployed", "no")
    assert got["Free careers adviser"] == "now"
    assert got["Check if you can get Universal Credit"] == "check"
    assert "Youth Guarantee" not in got and "Help to earn more in the job you have" not in got


def test_underemployed_on_universal_credit_gets_in_work_support() -> None:
    assert _status("22_24", "underemployed", "yes")["Help to earn more in the job you have"] == "now"


def test_hidden_18_year_old_is_told_what_a_claim_opens_up() -> None:
    got = _status("18", "not_working", "no")
    assert got["Youth Guarantee"] == "check" and got["Empower Oldham"] == "now" and got["Oldham Youth Hub"] == "now"


def test_claimant_gets_guarantee_now_and_jobs_guarantee_later() -> None:
    got = _status("19_21", "not_working", "yes")
    assert got["Youth Guarantee"] == "now" and got["Jobs Guarantee: six months of paid work"] == "later"
    assert list(got.values()) == sorted(got.values(), key=routes.ORDER.get)  # now, then check, then later


def test_age_limits() -> None:
    old = _status("25_plus", "not_working", "yes")
    assert "Youth Guarantee" not in old and "Empower Oldham" not in old and old["Oldham Youth Hub"] == "check"
    assert routes.find(None, "not_working", "yes") == [] and routes.find("18", None, None) == []


def test_match_returns_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api.matcher, "_client", FakeClient(_analysis([{"opportunity_id": "vol-dofe", "why": "w", "first_step": "s"}])))
    body = {"path": "explore", "type": "paid_work", "situation": "underemployed", "age": "22_24", "universal_credit": "no"}
    data = client.post("/api/match", json=body).json()
    assert data["routes"][0]["name"] == "Free careers adviser" and data["routes"][0]["phone"] == "0800 072 0288"
    assert client.post("/api/match", json={**body, "age": "30"}).status_code == 422
