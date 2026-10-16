"""Market jobs: a fixed keyword only, live Adzuna results when keys are set, search links always."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

import api
import jobs

client = TestClient(api.app)
BODY = {"path": "explore", "type": "paid_work", "interests": "football and my mate Sam, 07700 900123"}


def test_keyword_comes_from_a_fixed_list() -> None:
    assert jobs.keyword("Gaming and tech") == "IT support"
    assert jobs.keyword("I like to start things", "part time") == "apprentice"  # "start"/"part" are not "art"
    assert jobs.keyword("helping my nan") == "care assistant"
    assert jobs.keyword(None, None) == "apprentice"


def test_without_keys_only_search_links(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    data = client.post("/api/jobs", json=BODY).json()
    assert data["live"] is False and data["jobs"] == [] and data["keyword"] == "leisure assistant"
    assert all("Oldham" in link["url"] or "oldham" in link["url"] for link in data["search_links"])


def test_live_jobs_send_nothing_personal(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    jobs._adzuna.cache_clear()
    sent = {}

    def fake_get(url, params, timeout):
        sent.update(params)
        return httpx.Response(200, request=httpx.Request("GET", url), json={"results": [
            {"title": "Leisure Assistant", "company": {"display_name": "Oldham Active"}, "location": {"display_name": "Oldham"},
             "salary_min": 21000, "salary_max": 23000, "created": "2026-10-10T09:00:00Z", "redirect_url": "https://www.adzuna.co.uk/jobs/1"},
            {"title": "Bad link", "redirect_url": "javascript:alert(1)"},
        ]})

    monkeypatch.setattr(jobs.httpx, "get", fake_get)
    data = client.post("/api/jobs", json=BODY).json()
    assert data["live"] and [j["title"] for j in data["jobs"]] == ["Leisure Assistant"]
    assert data["jobs"][0]["salary"] == "£21,000 to £23,000"
    assert "Sam" not in str(sent) and "07700" not in str(sent) and sent["what"] == "leisure assistant"
    jobs._adzuna.cache_clear()
