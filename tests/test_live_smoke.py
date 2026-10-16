"""Tests for the opt-in live DeepSeek verification command."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from scripts import verify_deepseek


def test_live_smoke_requires_the_server_side_secret(monkeypatch) -> None:
    monkeypatch.setattr(verify_deepseek.config, "DEEPSEEK_API_KEY", "")

    with pytest.raises(SystemExit, match="not available"):
        verify_deepseek.main()


def test_live_smoke_exercises_matching_and_chat(monkeypatch, capsys) -> None:
    calls: list[str] = []

    class FakeMatcher:
        def __init__(self, _directory) -> None:
            calls.append("init")

        def run(self, _answers):
            calls.append("match")
            return SimpleNamespace(used_ai=True, matches=[{"opportunity_id": "work-apprenticeships"}])

        def chat(self, **_kwargs):
            calls.append("chat")
            return SimpleNamespace(used_ai=True, reply="Start with one application.")

    monkeypatch.setattr(verify_deepseek.config, "DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setattr(verify_deepseek.Directory, "load", lambda *_args: object())
    monkeypatch.setattr(verify_deepseek, "Matcher", FakeMatcher)

    verify_deepseek.main()

    assert calls == ["init", "match", "chat"]
    assert "smoke check passed" in capsys.readouterr().out
