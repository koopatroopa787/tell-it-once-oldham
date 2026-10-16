"""ElevenLabs voice for Pathly: read results aloud, and turn spoken answers into text.

The API key stays on the server; the browser only ever talks to /api/speak and /api/transcribe.
Audio is passed straight through and never written to disk.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque

import httpx

import config


# A little less stability than the default sounds more human; slightly slower sounds kinder.
VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True, "speed": 0.95}

_CUE = re.compile(r"\s*\[[a-z][a-z' -]{0,30}\]\s*")


def without_cues(text: str) -> str:
    """Remove lowercase delivery cues such as [happy]; uppercase redaction tags like [PHONE] are kept."""
    return re.sub(r"\s{2,}", " ", _CUE.sub(" ", text)).strip()


class VoiceUnavailable(RuntimeError):
    """Raised when ElevenLabs is not configured or does not answer, so the site can fall back to text."""


class ElevenLabsClient:
    """Thin wrapper over the two ElevenLabs endpoints Pathly uses."""

    def __init__(
        self,
        api_key: str = config.ELEVENLABS_API_KEY,
        voice_id: str = config.ELEVENLABS_VOICE_ID,
        base_url: str = "https://api.elevenlabs.io",
    ) -> None:
        self.api_key = api_key
        self.voice_id = voice_id
        self.base_url = base_url.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _post(self, path: str, **kwargs) -> httpx.Response:
        if not self.api_key:
            raise VoiceUnavailable("ELEVENLABS_API_KEY is not set.")
        try:
            response = httpx.post(
                f"{self.base_url}{path}", headers={"xi-api-key": self.api_key}, timeout=config.VOICE_TIMEOUT, **kwargs
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise VoiceUnavailable(f"ElevenLabs did not answer: {exc}") from exc
        return response

    def speak(self, text: str) -> bytes:
        """Text to MP3 audio, in a warm, unhurried delivery. Expressive cues like [happy] are dropped, not read out."""
        response = self._post(
            f"/v1/text-to-speech/{self.voice_id}",
            params={"output_format": "mp3_44100_64"},
            json={"text": without_cues(text) or text, "model_id": config.ELEVENLABS_TTS_MODEL, "voice_settings": VOICE_SETTINGS},
        )
        return response.content

    def transcribe(self, audio: bytes, filename: str = "answer.webm", content_type: str = "audio/webm") -> str:
        """Speech to text. The language is detected automatically, so any language works."""
        response = self._post(
            "/v1/speech-to-text",
            data={"model_id": config.ELEVENLABS_STT_MODEL},
            files={"file": (filename, audio, content_type)},
        )
        return str(response.json().get("text", "")).strip()


class RateLimiter:
    """Allows `limit` calls per `window` seconds per key. In memory, so it resets when the server restarts."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True
