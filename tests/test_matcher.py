"""Offline tests for the young people's matcher. No API key needed."""

from __future__ import annotations

import json

import config
from directory import Directory
from matcher import MATCH_TOOL, Matcher


class FakeClient:
    """Returns a fixed DeepSeek-style tool call and records what was sent."""

    def __init__(self, ids: list[str]) -> None:
        self.ids = ids
        self.sent = ""
        self.payload: dict = {}

    def chat(self, payload: dict) -> dict:
        self.payload = payload
        self.sent = payload["messages"][-1]["content"]
        arguments = json.dumps({"matches": [{"opportunity_id": i, "why": "w", "first_step": "s"} for i in self.ids]})
        call = {"id": "c1", "type": "function", "function": {"name": MATCH_TOOL["name"], "arguments": arguments}}
        return {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [call]}}]}


def _directory() -> Directory:
    return Directory.load(config.OPPORTUNITIES_PATH, "Testborough")


def test_unknown_opportunities_are_dropped_and_pii_removed() -> None:
    client = FakeClient(["vol-dofe", "made-up", "vol-dofe"])
    result = Matcher(_directory(), client=client).run({"type": "voluntary", "hobbies": "football, call 07700 900123"})
    assert [m["opportunity_id"] for m in result.matches] == ["vol-dofe"]
    assert result.dropped_ids == ["made-up"]
    assert "07700" not in client.sent and "[PHONE]" in client.sent


def test_request_forces_the_match_tool_with_thinking_off() -> None:
    client = FakeClient(["vol-dofe"])
    Matcher(_directory(), client=client).run({"type": "voluntary"})
    assert client.payload["messages"][0]["role"] == "system"
    assert client.payload["tool_choice"] == {"type": "function", "function": {"name": MATCH_TOOL["name"]}}
    assert client.payload["thinking"] == {"type": "disabled"}


def test_malformed_reply_falls_back() -> None:
    class Broken(FakeClient):
        def chat(self, payload: dict) -> dict:
            return {"choices": [{"message": {"tool_calls": [{"function": {"name": MATCH_TOOL["name"], "arguments": "{oops"}}]}}]}

    result = Matcher(_directory(), client=Broken([])).run({"type": "voluntary"})
    assert result.matches and not result.used_ai


def test_missing_key_falls_back_without_a_network_call() -> None:
    from matcher import DeepSeekClient

    result = Matcher(_directory(), client=DeepSeekClient(api_key="")).run({"type": "paid_work"})
    assert result.matches and not result.used_ai


def test_fallback_matches_type_and_prefers_district() -> None:
    result = Matcher(_directory(), client=object()).run({"type": "social_work", "district": "Central"})
    ids = [m["opportunity_id"] for m in result.matches]
    assert not result.used_ai
    assert ids[0] == "social-mahdlo"
    assert all(i.startswith("social-") for i in ids)


def test_every_opportunity_has_a_way_to_get_in_touch() -> None:
    for opp in _directory().services:
        assert opp["link"] or opp["phone"] or opp["contact"], opp["id"]
        assert opp["category"] in {"voluntary", "paid_work", "social_work"}, opp["id"]
