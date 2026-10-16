"""Offline tests for the grounded Pathly chatbot. No live DeepSeek request is made."""

from __future__ import annotations

from types import SimpleNamespace

import config
from deepseek.matcher import Matcher
from directory import Directory


class ChatClient:
    def __init__(self, reply: dict) -> None:
        self.reply = reply
        self.calls: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = {
            "summary": "Summary",
            "strengths": [],
            "possible_directions": [],
            "matches": [{"opportunity_id": "work-apprenticeships", "why": "w", "first_step": "s", "barrier_tip": "t"}],
            "follow_up_questions": [],
            "confidence": "medium",
        }
        if kwargs["tools"][0]["name"] == "reply_to_young_person":
            payload = self.reply
        return SimpleNamespace(content=[SimpleNamespace(type="tool_use", input=payload)])


def _matcher(client) -> Matcher:
    directory = Directory.load(config.OPPORTUNITIES_PATH, "Testborough")
    return Matcher(directory, client=client)


def test_chat_is_grounded_in_displayed_matches_and_redacts_pii() -> None:
    client = ChatClient(
        {
            "reply": "An apprenticeship could let you learn while earning.",
            "referenced_opportunity_ids": ["work-apprenticeships", "made-up-service"],
            "suggested_questions": ["What could I do this week?", "How do I compare routes?"],
            "needs_human_support": False,
        }
    )
    result = _matcher(client).chat(
        answers={"type": "paid_work", "interests": "engineering", "name": "PRIVATE"},
        matched_opportunity_ids=["work-apprenticeships"],
        history=[
            {"role": "user", "content": "Phone me on 07700 900123"},
            {"role": "assistant", "content": "I cannot phone you."},
        ],
        message="What jobs could suit me? Email a.b@example.com",
    )

    assert result.referenced_opportunity_ids == ["work-apprenticeships"]
    assert result.dropped_ids == ["made-up-service"]
    assert result.used_ai
    sent = str(client.calls[-1])
    assert "07700" not in sent and "example.com" not in sent
    assert "[PHONE]" in sent and "[EMAIL]" in sent
    assert "PRIVATE" not in sent


def test_chat_limits_history_and_output_lengths() -> None:
    client = ChatClient(
        {
            "reply": "r" * 1500,
            "referenced_opportunity_ids": ["work-apprenticeships"],
            "suggested_questions": ["q" * 500] * 8,
            "needs_human_support": False,
        }
    )
    history = [{"role": "user", "content": f"message {index}"} for index in range(20)]
    result = _matcher(client).chat(
        answers={"type": "paid_work"},
        matched_opportunity_ids=["work-apprenticeships"],
        history=history,
        message="Help me compare.",
    )

    assert len(client.calls[-1]["messages"]) == 9
    assert len(result.reply) == 900
    assert len(result.suggested_questions) == 3
    assert all(len(question) <= 140 for question in result.suggested_questions)


def test_crisis_message_bypasses_deepseek() -> None:
    client = ChatClient({})
    result = _matcher(client).chat(
        answers={"type": "paid_work"},
        matched_opportunity_ids=["work-apprenticeships"],
        history=[],
        message="I have nowhere to sleep tonight",
    )

    assert result.needs_human_support
    assert not result.used_ai
    assert "Oldham Housing Options" in result.reply
    assert "0800 988 7061" in result.reply
    assert client.calls == []


def test_chat_failure_returns_a_safe_grounded_fallback() -> None:
    result = _matcher(object()).chat(
        answers={"type": "paid_work"},
        matched_opportunity_ids=["work-apprenticeships"],
        history=[],
        message="What should I do next?",
    )

    assert not result.used_ai
    assert result.referenced_opportunity_ids == ["work-apprenticeships"]
    assert "Find an apprenticeship" in result.reply
