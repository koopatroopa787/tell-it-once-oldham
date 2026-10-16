"""Pathly HTTP API for the website. The React front end calls these endpoints; no UI lives here.

Run with:  uvicorn api:app --reload
Docs:      http://localhost:8000/docs
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

import config
import questions
from deepseek.matcher import Matcher
from directory import Directory
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
    district: str | None = None
    hobbies: str | None = Field(None, max_length=TEXT_LIMIT)
    studies: str | None = Field(None, max_length=TEXT_LIMIT)
    interests: str | None = Field(None, max_length=TEXT_LIMIT)
    experience: str | None = Field(None, max_length=TEXT_LIMIT)

    @field_validator("district")
    @classmethod
    def _known_district(cls, value: str | None) -> str | None:
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
    barrier_tip: str = ""
    phone: str = ""
    contact: str = ""
    link: str = ""


class Direction(BaseModel):
    route: str
    title: str
    why: str


class MatchResponse(BaseModel):
    crisis: Crisis | None
    summary: str = ""
    strengths: list[str] = []
    possible_directions: list[Direction] = []
    matches: list[Match]
    follow_up_questions: list[str] = []
    confidence: str = "low"
    used_ai: bool


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(max_length=TEXT_LIMIT)


class ChatRequest(BaseModel):
    """A follow-up question about the matches already shown. The answers are the same fields as /api/match."""

    model_config = ConfigDict(extra="forbid")

    answers: MatchRequest
    matched_opportunity_ids: list[str] = Field(max_length=5)
    history: list[ChatTurn] = Field(default_factory=list, max_length=16)
    message: str = Field(min_length=1, max_length=800)


class ChatResponse(BaseModel):
    reply: str
    referenced_opportunity_ids: list[str]
    suggested_questions: list[str]
    needs_human_support: bool
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


@app.get("/api/voice/session")
def voice_session() -> dict[str, str]:
    """A short-lived signed URL for the ElevenLabs voice agent, so the API key never reaches the browser."""
    if not (config.ELEVENLABS_API_KEY and config.ELEVENLABS_AGENT_ID):
        raise HTTPException(503, "Voice chat is not set up.")
    try:
        response = httpx.get(
            "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
            params={"agent_id": config.ELEVENLABS_AGENT_ID},
            headers={"xi-api-key": config.ELEVENLABS_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
        return {"signed_url": response.json()["signed_url"]}
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(502, "Voice chat is unavailable right now.") from exc


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
                barrier_tip=m.get("barrier_tip") or "",
                phone=opp.get("phone") or "",
                contact=opp.get("contact") or "",
                link=opp.get("link") or "",
            )
        )
    return MatchResponse(
        crisis=crisis,
        summary="" if crisis else result.summary,  # on a crisis the matcher's summary repeats the crisis message
        strengths=result.strengths,
        possible_directions=[Direction(**d) for d in result.possible_directions],
        matches=matches,
        follow_up_questions=result.follow_up_questions,
        confidence=result.confidence,
        used_ai=result.used_ai,
    )


chat_limiter = RateLimiter(config.CHAT_LIMIT_PER_10_MIN, 600)


@app.post("/api/chat")
def chat(body: ChatRequest, request: Request) -> ChatResponse:
    """Answer a follow-up about the displayed matches only. Crisis messages bypass the AI."""
    if not chat_limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "Too many questions in a short time. Please wait a few minutes.")
    result = matcher.chat(
        answers=body.answers.model_dump(exclude_none=True),
        matched_opportunity_ids=body.matched_opportunity_ids,
        history=[turn.model_dump() for turn in body.history],
        message=body.message,
    )
    return ChatResponse(
        reply=result.reply,
        referenced_opportunity_ids=result.referenced_opportunity_ids,
        suggested_questions=result.suggested_questions,
        needs_human_support=result.needs_human_support,
        used_ai=result.used_ai,
    )


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


# The plain HTML front ends: Akshita's Oldham map at /map, web/ at /. Mounted last so /api routes win.
app.mount("/map", StaticFiles(directory=config.ROOT / "frontend", html=True), name="map")
app.mount("/", StaticFiles(directory=config.ROOT / "web", html=True), name="web")
