from __future__ import annotations

import pytest

import config
from deepseek import gateway as deepseek_gateway


def test_gateway_requires_a_server_side_key(monkeypatch) -> None:
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "")
    with pytest.raises(deepseek_gateway.DeepSeekUnavailable, match="not configured"):
        deepseek_gateway.create_deepseek_client()


def test_gateway_rejects_non_official_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "secret")
    monkeypatch.setattr(config, "DEEPSEEK_BASE_URL", "http://attacker.example")
    with pytest.raises(deepseek_gateway.DeepSeekUnavailable, match="official HTTPS"):
        deepseek_gateway.create_deepseek_client()


def test_gateway_passes_the_key_only_to_the_sdk(monkeypatch) -> None:
    captured = {}

    def fake_client(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "server-only-secret")
    monkeypatch.setattr(config, "DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
    monkeypatch.setattr(deepseek_gateway.anthropic, "Anthropic", fake_client)
    deepseek_gateway.create_deepseek_client()

    assert captured["api_key"] == "server-only-secret"
    assert captured["base_url"] == "https://api.deepseek.com/anthropic"


def test_gateway_strips_accidental_secret_whitespace(monkeypatch) -> None:
    captured = {}

    def fake_client(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "  server-only-secret\r\n")
    monkeypatch.setattr(config, "DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
    monkeypatch.setattr(deepseek_gateway.anthropic, "Anthropic", fake_client)

    deepseek_gateway.create_deepseek_client()

    assert captured["api_key"] == "server-only-secret"
