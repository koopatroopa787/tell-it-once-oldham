"""Turns a connector's notes into one story, matched offers and warm handovers."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

import anthropic

import config
from directory import Directory

CATEGORY_LABELS: dict[str, str] = {
    "money_debt": "Money and debt",
    "benefits": "Benefits",
    "housing": "Housing",
    "work_skills": "Work and skills",
    "health_wellbeing": "Health and wellbeing",
    "food": "Food and essentials",
    "digital_access": "Getting online",
    "family_young_people": "Family and young people",
    "caring_bereavement": "Caring and bereavement",
    "social_connection": "Connection and loneliness",
    "safety": "Safety",
    "other": "Other",
}
URGENCY_LEVELS = ["urgent", "this_week", "routine"]
CONFIDENCE_LEVELS = ["high", "medium", "low"]

SYSTEM_TEMPLATE = """You support community connectors and volunteers at Live Well Centres and Live Well Spaces in {borough}, Greater Manchester. A connector is sitting with a resident. They give you their notes from the conversation, which may be in English or in the resident's language, may be messy, and often describe several linked problems at once.

Your job is to help the connector, not to replace them:
1. Turn the notes into one clear story so the resident never has to repeat themselves.
2. Identify every need, including ones mentioned in passing, and how urgent each is.
3. Match needs to offers in the SERVICE DIRECTORY below. Recommend only listed services, using their exact id. If no listed service fits a need, put it in unmet_needs instead of inventing one.
4. For each recommended service, draft a warm handover: a short message the connector can send with the resident's consent, a phone script the connector can read when they ring the service on the resident's behalf, and what the resident should bring.
5. Write a plan for the resident in plain language.

Rules:
- Never decide eligibility. Say "may be able to get" and name who decides.
- Order recommendations by priority. Recommend three to five services, not a long list.
- Plain language for the resident: short sentences, no jargon, reading age around nine. Write plan_for_resident in {language}. Always also write plan_for_resident_english, so the connector can check it.
- Handover messages and phone scripts are in English, factual, respectful, no judgement, and mention that the resident has consented to the referral. Phone scripts take about 30 seconds to read aloud.
- Set needs_person_today to true if anyone may be at risk, if there is a same-day need such as nowhere to sleep or no food, or if the situation is beyond what a connector should handle alone.
- Personal details have been replaced with tags like [PHONE] or [POSTCODE]. Never ask for or invent them.
- questions_to_ask are at most three short questions the connector could ask next because the answer would change the plan.

SERVICE DIRECTORY:
{directory}
"""

TRIAGE_TOOL: dict[str, Any] = {
    "name": "record_plan",
    "description": "Record the structured plan for this resident.",
    "input_schema": {
        "type": "object",
        "properties": {
            "one_story": {
                "type": "string",
                "description": "Neutral summary of the resident's situation in English, under 90 words, written so a receiving service understands it without asking again.",
            },
            "needs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "enum": list(CATEGORY_LABELS)},
                        "summary": {"type": "string"},
                        "urgency": {"type": "string", "enum": URGENCY_LEVELS},
                    },
                    "required": ["category", "summary", "urgency"],
                },
            },
            "handovers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_id": {"type": "string"},
                        "why": {"type": "string", "description": "One sentence on why this service fits."},
                        "handover_message": {"type": "string"},
                        "phone_script": {"type": "string"},
                        "what_to_bring": {"type": "string"},
                    },
                    "required": ["service_id", "why", "handover_message", "phone_script", "what_to_bring"],
                },
            },
            "unmet_needs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Needs that no service in the directory covers.",
            },
            "plan_for_resident": {"type": "string"},
            "plan_for_resident_english": {"type": "string"},
            "questions_to_ask": {"type": "array", "items": {"type": "string"}},
            "needs_person_today": {"type": "boolean"},
            "reason_for_person_today": {"type": "string"},
            "confidence": {"type": "string", "enum": CONFIDENCE_LEVELS},
        },
        "required": [
            "one_story",
            "needs",
            "handovers",
            "unmet_needs",
            "plan_for_resident",
            "plan_for_resident_english",
            "questions_to_ask",
            "needs_person_today",
            "reason_for_person_today",
            "confidence",
        ],
    },
}


class TriageError(RuntimeError):
    """Raised when no plan could be produced, live or from the cache."""


@dataclass
class TriageResult:
    plan: dict
    dropped_service_ids: list[str] = field(default_factory=list)
    from_cache: bool = False


class TriageEngine:
    """Calls the model with a forced tool call and validates what comes back."""

    def __init__(self, directory: Directory, client: Any | None = None, model: str = config.MODEL) -> None:
        self.directory = directory
        self.model = model
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            self._client = anthropic.Anthropic()
        return self._client

    def run(self, notes: str, language: str) -> TriageResult:
        key = _cache_key(self.model, self.directory, notes, language)
        try:
            raw = self._call_model(notes, language)
        except Exception as exc:  # network down, bad key, rate limit
            cached = _cache_load(key)
            if cached is None:
                raise TriageError(str(exc)) from exc
            plan, dropped = self._validate(cached)
            return TriageResult(plan, dropped, from_cache=True)
        _cache_save(key, raw)
        plan, dropped = self._validate(raw)
        return TriageResult(plan, dropped)

    def _call_model(self, notes: str, language: str) -> dict:
        system = SYSTEM_TEMPLATE.format(
            borough=config.BOROUGH, language=language, directory=self.directory.to_prompt()
        )
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.MAX_TOKENS,
            system=system,
            tools=[TRIAGE_TOOL],
            tool_choice={"type": "tool", "name": TRIAGE_TOOL["name"]},
            messages=[{"role": "user", "content": f"Connector's notes:\n\n{notes}"}],
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use":
                return dict(block.input)
        raise TriageError("The model did not return a plan.")

    def _validate(self, raw: dict) -> tuple[dict, list[str]]:
        """Normalise the model output and drop any service the directory does not contain."""
        plan: dict[str, Any] = {
            "one_story": str(raw.get("one_story") or "").strip(),
            "needs": [],
            "handovers": [],
            "unmet_needs": [str(n) for n in raw.get("unmet_needs") or []],
            "plan_for_resident": str(raw.get("plan_for_resident") or "").strip(),
            "plan_for_resident_english": str(raw.get("plan_for_resident_english") or "").strip(),
            "questions_to_ask": [str(q) for q in raw.get("questions_to_ask") or []][:3],
            "needs_person_today": bool(raw.get("needs_person_today")),
            "reason_for_person_today": str(raw.get("reason_for_person_today") or ""),
            "confidence": raw.get("confidence") if raw.get("confidence") in CONFIDENCE_LEVELS else "low",
        }
        for need in raw.get("needs") or []:
            category = need.get("category") if need.get("category") in CATEGORY_LABELS else "other"
            urgency = need.get("urgency") if need.get("urgency") in URGENCY_LEVELS else "routine"
            plan["needs"].append({"category": category, "summary": str(need.get("summary", "")), "urgency": urgency})

        dropped: list[str] = []
        seen: set[str] = set()
        for item in raw.get("handovers") or []:
            sid = str(item.get("service_id", "")).strip()
            if sid in seen:
                continue
            seen.add(sid)
            if sid not in self.directory.ids:
                dropped.append(sid)
                continue
            plan["handovers"].append(
                {
                    "service_id": sid,
                    "why": str(item.get("why", "")),
                    "handover_message": str(item.get("handover_message", "")),
                    "phone_script": str(item.get("phone_script", "")),
                    "what_to_bring": str(item.get("what_to_bring", "")),
                    "status": "Not started",
                }
            )
        if dropped:
            plan["confidence"] = "low"
        return plan, dropped


def _cache_key(model: str, directory: Directory, notes: str, language: str) -> str:
    payload = json.dumps([model, config.BOROUGH, sorted(directory.ids), notes.strip(), language])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_load(key: str) -> dict | None:
    if not config.CACHE_PATH.exists():
        return None
    try:
        return json.loads(config.CACHE_PATH.read_text(encoding="utf-8")).get(key)
    except json.JSONDecodeError:
        return None


def _cache_save(key: str, raw: dict) -> None:
    cache: dict[str, Any] = {}
    if config.CACHE_PATH.exists():
        try:
            cache = json.loads(config.CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            cache = {}
    cache[key] = raw
    config.CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
