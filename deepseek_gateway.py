"""Small server-side DeepSeek client boundary for Pathly."""

from __future__ import annotations

from urllib.parse import urlparse

import anthropic

import config


class DeepSeekUnavailable(RuntimeError):
    """Raised when Pathly cannot safely create its DeepSeek client."""


def create_deepseek_client():
    """Create an Anthropic-compatible client without exposing the key."""
    api_key = config.DEEPSEEK_API_KEY.strip()
    if not api_key:
        raise DeepSeekUnavailable("DEEPSEEK_API_KEY is not configured.")

    endpoint = urlparse(config.DEEPSEEK_BASE_URL)
    if endpoint.scheme != "https" or endpoint.hostname != "api.deepseek.com":
        raise DeepSeekUnavailable("DEEPSEEK_BASE_URL must use the official HTTPS endpoint.")

    return anthropic.Anthropic(
        api_key=api_key,
        base_url=config.DEEPSEEK_BASE_URL,
        timeout=config.DEEPSEEK_TIMEOUT_SECONDS,
    )
