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

        def _call_analysis(self, _answers):
            calls.append("match")
            return {"matches": [{"opportunity_id": "work-apprenticeships"}]}

        def _validate_analysis(self, raw, _opportunity_type):
            return SimpleNamespace(matches=raw["matches"])

        def _call_chat(self, *_args):
            calls.append("chat")
            return {"reply": "Start with one application."}

        def _validate_chat(self, raw, _opportunity_ids):
            return SimpleNamespace(reply=raw["reply"])

    monkeypatch.setattr(verify_deepseek.config, "DEEPSEEK_API_KEY", "test-secret")
    monkeypatch.setattr(verify_deepseek.Directory, "load", lambda *_args: object())
    monkeypatch.setattr(verify_deepseek, "Matcher", FakeMatcher)

    verify_deepseek.main()

    assert calls == ["init", "match", "chat"]
    assert "smoke check passed" in capsys.readouterr().out


def test_live_smoke_reports_only_safe_api_failure_details(capsys) -> None:
    error = RuntimeError("response body that should not be logged")
    error.status_code = 401

    with pytest.raises(SystemExit, match=r"HTTP 401 \(RuntimeError\)") as raised:
        verify_deepseek._stop_for_api_error("matching", error)

    assert "response body" not in str(raised.value)
    annotation = capsys.readouterr().out
    assert annotation.startswith("::error title=DeepSeek integration check::")
    assert "response body" not in annotation
