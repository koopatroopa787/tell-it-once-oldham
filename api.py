"""Pathly HTTP API for the website. The React front end calls these endpoints; no UI lives here.

Run with:  uvicorn api:app --reload
Docs:      http://localhost:8000/docs
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

import config
import questions
from directory import Directory
from matcher import Matcher
from safety import check_crisis

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


# The plain HTML front end in web/ (until the React site exists). Mounted last so /api routes win.
app.mount("/", StaticFiles(directory=config.ROOT / "web", html=True), name="web")
