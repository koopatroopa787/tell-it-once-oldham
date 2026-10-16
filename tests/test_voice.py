"""Offline tests for the ElevenLabs voice endpoints. No key needed and no credits spent."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import api
from voice import RateLimiter, VoiceUnavailable

client = TestClient(api.app)


class FakeVoice:
    """Stands in for ElevenLabsClient and records what it was asked."""

    enabled = True

    def __init__(self, fail: bool = False, transcript: str = "I like football, call me on 07700 900123") -> None:
        self.fail = fail
        self.transcript = transcript
        self.spoken = ""
        self.audio = b""

    def speak(self, text: str) -> bytes:
        if self.fail:
            raise VoiceUnavailable("down")
        self.spoken = text
        return b"ID3fake-mp3"

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        if self.fail:
            raise VoiceUnavailable("down")
        self.audio = audio
        return self.transcript


@pytest.fixture
def fake_voice(monkeypatch: pytest.MonkeyPatch) -> FakeVoice:
    fake = FakeVoice()
    monkeypatch.setattr(api, "voice", fake)
    monkeypatch.setattr(api, "voice_limiter", RateLimiter(100, 600))
    return fake


def test_status_reports_whether_voice_is_set_up(fake_voice: FakeVoice) -> None:
    assert client.get("/api/voice").json() == {"enabled": True}


def test_speak_returns_mp3(fake_voice: FakeVoice) -> None:
    response = client.post("/api/speak", json={"text": "Mahdlo Youth Zone"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content.startswith(b"ID3") and fake_voice.spoken == "Mahdlo Youth Zone"


def test_speak_rejects_empty_and_long_text(fake_voice: FakeVoice) -> None:
    assert client.post("/api/speak", json={"text": ""}).status_code == 422
    assert client.post("/api/speak", json={"text": "x" * (api.SPEAK_LIMIT + 1)}).status_code == 422


def test_transcript_has_personal_details_removed(fake_voice: FakeVoice) -> None:
    response = client.post("/api/transcribe", content=b"webm-bytes", headers={"Content-Type": "audio/webm"})
    body = response.json()
    assert response.status_code == 200 and fake_voice.audio == b"webm-bytes"
    assert "07700" not in body["text"] and "[PHONE]" in body["text"]
    assert body["removed"] == ["phone number"]


def test_empty_recording_is_rejected(fake_voice: FakeVoice) -> None:
    assert client.post("/api/transcribe", content=b"", headers={"Content-Type": "audio/webm"}).status_code == 422


def test_elevenlabs_down_gives_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "voice", FakeVoice(fail=True))
    monkeypatch.setattr(api, "voice_limiter", RateLimiter(100, 600))
    assert client.post("/api/speak", json={"text": "hello"}).status_code == 503
    assert client.post("/api/transcribe", content=b"a", headers={"Content-Type": "audio/webm"}).status_code == 503


def test_no_key_means_voice_off(monkeypatch: pytest.MonkeyPatch) -> None:
    from voice import ElevenLabsClient

    monkeypatch.setattr(api, "voice", ElevenLabsClient(api_key=""))
    assert client.get("/api/voice").json() == {"enabled": False}
    assert client.post("/api/speak", json={"text": "hello"}).status_code == 503


def test_rate_limit_protects_your_credits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "voice", FakeVoice())
    monkeypatch.setattr(api, "voice_limiter", RateLimiter(2, 600))
    codes = [client.post("/api/speak", json={"text": "hi"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_delivery_cues_are_dropped_but_redaction_tags_kept() -> None:
    from voice import without_cues

    assert without_cues("[happy] Nice one, being a student [laughs] gives us lots") == "Nice one, being a student gives us lots"
    assert without_cues("Call [PHONE] today") == "Call [PHONE] today"


def test_speak_never_reads_cues_aloud(monkeypatch: pytest.MonkeyPatch) -> None:
    import voice as voice_module

    sent = {}

    def fake_post(url: str, **kwargs):
        import httpx

        sent.update(kwargs["json"])
        return httpx.Response(200, content=b"ID3", request=httpx.Request("POST", url))

    monkeypatch.setattr(voice_module.httpx, "post", fake_post)
    voice_module.ElevenLabsClient(api_key="k", voice_id="v").speak("[happy] That's great that you're studying.")
    assert sent["text"] == "That's great that you're studying."
    assert sent["voice_settings"]["speed"] == 0.95
