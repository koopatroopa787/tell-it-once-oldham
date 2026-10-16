"""Pathly HTTP API for the website. The React front end calls these endpoints; no UI lives here.

Run with:  uvicorn api:app --reload
Docs:      http://localhost:8000/docs
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

import config
import questions
from directory import Directory
from matcher import Matcher
from safety import PII_LABELS, check_crisis, redact_pii
from voice import ElevenLabsClient, RateLimiter, VoiceUnavailable

TEXT_LIMIT = 1000

app = FastAPI(title="Pathly API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

matcher = Matcher(Directory.load(config.OPPORTUNITIES_PATH, config.BOROUGH))


class MatchRequest(BaseModel):
    """Everything the young person told us. Free text is redacted before the model sees it."""

    model_config = ConfigDict(extra="forbid")

    path: Literal["student", "explore"]
    type: Literal["voluntary", "paid_work", "social_work"]
    district: Optional[str] = None
    hobbies: Optional[str] = Field(None, max_length=TEXT_LIMIT)
    studies: Optional[str] = Field(None, max_length=TEXT_LIMIT)
    interests: Optional[str] = Field(None, max_length=TEXT_LIMIT)
    experience: Optional[str] = Field(None, max_length=TEXT_LIMIT)

    @field_validator("district")
    @classmethod
    def _known_district(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in questions.DISTRICTS:
            raise ValueError(f"district must be one of {questions.DISTRICTS}")
        return value


class Crisis(BaseModel):
    label: str
    message: str


class Match(BaseModel):
    id: str
    name: str
    provider: str
    area: str = ""
    category: str = ""
    why: str
    first_step: str
    phone: str = ""
    contact: str = ""
    link: str = ""


class MatchResponse(BaseModel):
    crisis: Optional[Crisis]
    matches: list[Match]
    used_ai: bool


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/questions")
def get_questions() -> dict:
    """The paths, opportunity types and questions to show, so the site never hard-codes them."""
    return {
        "borough": config.BOROUGH,
        "paths": questions.PATHS,
        "opportunity_types": questions.OPPORTUNITY_TYPES,
        "questions": questions.QUESTIONS,
        "privacy_note": questions.PRIVACY_NOTE,
    }


@app.post("/api/match")
def match(request: MatchRequest) -> MatchResponse:
    """Match answers to verified opportunities. Never fails: falls back to a simple match without the AI."""
    answers = request.model_dump(exclude_none=True)

    # Fixed safety information first; it never depends on the AI.
    found = check_crisis(" ".join(str(v) for v in answers.values()))
    crisis = Crisis(label=found.label, message=found.message.replace("{borough}", config.BOROUGH)) if found else None

    result = matcher.run(answers)
    matches = []
    for m in result.matches:
        opp = matcher.directory.get(m["opportunity_id"])
        matches.append(
            Match(
                id=opp["id"],
                name=opp["name"],
                provider=opp["provider"],
                area=opp.get("area") or "",
                category=opp.get("category") or "",
                why=m["why"],
                first_step=m["first_step"],
                phone=opp.get("phone") or "",
                contact=opp.get("contact") or "",
                link=opp.get("link") or "",
            )
        )
    return MatchResponse(crisis=crisis, matches=matches, used_ai=result.used_ai)


# ---- Voice (ElevenLabs) ------------------------------------------------------

SPEAK_LIMIT = 800
AUDIO_LIMIT = 10 * 1024 * 1024  # about a minute of compressed speech is well under this

voice = ElevenLabsClient()
voice_limiter = RateLimiter(config.VOICE_LIMIT_PER_10_MIN, 600)


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=SPEAK_LIMIT)


class Transcript(BaseModel):
    text: str
    removed: list[str]


def _check_voice(request: Request) -> None:
    if not voice.enabled:
        raise HTTPException(503, "Voice is not set up on this server.")
    if not voice_limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "Too many voice requests. Please wait a few minutes.")


@app.get("/api/voice")
def voice_status() -> dict[str, bool]:
    """Whether the site should show the listen and speak buttons."""
    return {"enabled": voice.enabled}


@app.post("/api/speak", response_class=Response, responses={200: {"content": {"audio/mpeg": {}}}})
def speak(body: SpeakRequest, request: Request) -> Response:
    """Read text aloud. Returns MP3 audio, or 503 so the site carries on as text only."""
    _check_voice(request)
    try:
        audio = voice.speak(body.text)
    except VoiceUnavailable as exc:
        raise HTTPException(503, "Voice is not available right now.") from exc
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.post("/api/transcribe")
async def transcribe(request: Request) -> Transcript:
    """Turn a spoken answer (raw audio in the request body) into text, with personal details removed."""
    _check_voice(request)
    audio = await request.body()
    if not audio:
        raise HTTPException(422, "No audio received.")
    if len(audio) > AUDIO_LIMIT:
        raise HTTPException(413, "That recording is too long. Try a shorter answer.")
    content_type = request.headers.get("content-type", "audio/webm").split(";")[0]
    extension = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav"}.get(content_type, "webm")
    try:
        text = voice.transcribe(audio, f"answer.{extension}", content_type)
    except VoiceUnavailable as exc:
        raise HTTPException(503, "Voice is not available right now.") from exc
    clean, removed = redact_pii(text)
    return Transcript(text=clean[:TEXT_LIMIT], removed=[PII_LABELS.get(tag, tag) for tag in removed])


# Akshita's full Oldham map app (frontend/). The orange site also loads its map data and Leaflet styles from here.
app.mount("/explore", StaticFiles(directory=config.ROOT / "frontend", html=True), name="explore")

# The plain HTML front end in web/ (until the React site exists). Mounted last so /api routes win.
app.mount("/", StaticFiles(directory=config.ROOT / "web", html=True), name="web")
