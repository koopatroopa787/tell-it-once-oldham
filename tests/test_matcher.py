"""Offline tests for the young people's matcher. No API key needed."""

from __future__ import annotations

from types import SimpleNamespace

import config
from directory import Directory
from matcher import Matcher


class FakeClient:
    """Returns a fixed tool call and records what was sent."""

    def __init__(self, ids: list[str]) -> None:
        self.ids = ids
        self.sent = ""
        self.messages = self

    def create(self, **kwargs):
        self.sent = kwargs["messages"][0]["content"]
        block = SimpleNamespace(
            type="tool_use",
            input={"matches": [{"opportunity_id": i, "why": "w", "first_step": "s"} for i in self.ids]},
        )
        return SimpleNamespace(content=[block])


def _directory() -> Directory:
    return Directory.load(config.OPPORTUNITIES_PATH, "Testborough")


def test_unknown_opportunities_are_dropped_and_pii_removed() -> None:
    client = FakeClient(["vol-dofe", "made-up", "vol-dofe"])
    result = Matcher(_directory(), client=client).run({"type": "voluntary", "hobbies": "football, call 07700 900123"})
    assert [m["opportunity_id"] for m in result.matches] == ["vol-dofe"]
    assert result.dropped_ids == ["made-up"]
    assert "07700" not in client.sent and "[PHONE]" in client.sent


def test_fallback_matches_type_and_prefers_district() -> None:
    result = Matcher(_directory(), client=object()).run({"type": "social_work", "district": "East"})
    ids = [m["opportunity_id"] for m in result.matches]
    assert not result.used_ai
    assert ids[0] == "social-young-carers"
    assert all(i.startswith("social-") for i in ids)
