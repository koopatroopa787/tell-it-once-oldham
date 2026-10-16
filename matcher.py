"""Matches a young person's answers to opportunities in the verified Oldham list.

Same pattern as triage.py, using DeepSeek: personal details are removed first, the model is forced to call one tool, and any
opportunity id that is not in the list is dropped. If the AI is unavailable, a simple category match is used instead,
so the demo never shows an empty page.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import json

import httpx

import config
from directory import Directory
from safety import redact_pii

SYSTEM_TEMPLATE = """You help young people in {borough}, Greater Manchester, find their next step: volunteering, paid work or social opportunities.

Rules:
- Recommend three to five opportunities from the OPPORTUNITIES list only, using their exact id. Prefer the type they chose and places near their district, but include a close alternative if it fits them better.
- For each, say in one or two friendly sentences why it fits what they told you, and give one small first step they could take this week.
- Never promise they will get a place or decide whether they are eligible. Say "you could" or "you may be able to".
- Plain, warm language for a 16 to 24 year old. No jargon.
- Personal details have been replaced with tags like [PHONE]. Never ask for them.

OPPORTUNITIES:
{opportunities}
"""

MATCH_TOOL: dict[str, Any] = {
    "name": "suggest_opportunities",
    "description": "Record the opportunities that fit this young person.",
    "input_schema": {
        "type": "object",
        "properties": {
            "matches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "opportunity_id": {"type": "string"},
                        "why": {"type": "string"},
                        "first_step": {"type": "string"},
                    },
                    "required": ["opportunity_id", "why", "first_step"],
                },
            }
        },
        "required": ["matches"],
    },
}


def _as_function(tool: dict[str, Any]) -> dict[str, Any]:
    """Convert a tool definition to the OpenAI-style function shape DeepSeek expects."""
    return {"name": tool["name"], "description": tool["description"], "parameters": tool["input_schema"]}


@dataclass
class MatchResult:
    matches: list[dict]
    dropped_ids: list[str] = field(default_factory=list)
    used_ai: bool = True


class DeepSeekClient:
    """Posts a chat completion to DeepSeek's OpenAI-compatible API and returns the JSON body."""

    def __init__(self, api_key: str = config.DEEPSEEK_API_KEY, base_url: str = config.DEEPSEEK_BASE_URL) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def chat(self, payload: dict) -> dict:
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not set.")
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
            timeout=config.MATCH_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()


class Matcher:
    """Calls the model with a forced tool call, validates against the list, and falls back to a simple match."""

    def __init__(self, directory: Directory, client: Any | None = None, model: str = config.MATCH_MODEL) -> None:
        self.directory = directory
        self.model = model
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            self._client = DeepSeekClient()
        return self._client

    def run(self, answers: dict) -> MatchResult:
        clean = {k: redact_pii(v)[0] if isinstance(v, str) else v for k, v in answers.items()}
        try:
            raw = self._call_model(clean)
        except Exception:  # no key, network down, rate limit, malformed reply
            # ponytail: no response cache like triage.py; add one if the venue wifi is unreliable.
            return MatchResult(self.fallback(clean), used_ai=False)
        matches, dropped = self._validate(raw)
        return MatchResult(matches or self.fallback(clean), dropped, used_ai=bool(matches))

    def _call_model(self, answers: dict) -> dict:
        system = SYSTEM_TEMPLATE.format(borough=config.BOROUGH, opportunities=self._to_prompt())
        about = "\n".join(f"- {k}: {v}" for k, v in answers.items() if v)
        body = self.client.chat(
            {
                "model": self.model,
                "max_tokens": config.MAX_TOKENS,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"What the young person told us:\n{about}"},
                ],
                "tools": [{"type": "function", "function": _as_function(MATCH_TOOL)}],
                "tool_choice": {"type": "function", "function": {"name": MATCH_TOOL["name"]}},
                "thinking": {"type": "disabled"},  # DeepSeek rejects a forced tool call in thinking mode
            }
        )
        for call in body["choices"][0]["message"].get("tool_calls") or []:
            if call["function"]["name"] == MATCH_TOOL["name"]:
                return json.loads(call["function"]["arguments"])
        raise RuntimeError("The model did not return any matches.")

    def _to_prompt(self) -> str:
        return "\n".join(
            f"- id: {o['id']} | {o['name']} ({o['provider']}) | type: {o['category']} | area: {o.get('area', '')}\n"
            f"  {o['description']} Who it is for: {o['who_it_is_for']}"
            for o in self.directory.services
        )

    def _validate(self, raw: dict) -> tuple[list[dict], list[str]]:
        """Keep only opportunities that exist in the list, once each."""
        matches: list[dict] = []
        dropped: list[str] = []
        seen: set[str] = set()
        for item in raw.get("matches") or []:
            oid = str(item.get("opportunity_id", "")).strip()
            if oid in seen:
                continue
            seen.add(oid)
            if oid not in self.directory.ids:
                dropped.append(oid)
                continue
            matches.append({"opportunity_id": oid, "why": str(item.get("why", "")), "first_step": str(item.get("first_step", ""))})
        return matches, dropped

    def fallback(self, answers: dict) -> list[dict]:
        """No-AI match: same type, nearest district first, up to three."""
        district = answers.get("district")
        same_type = [o for o in self.directory.services if o["category"] == answers.get("type")]
        same_type.sort(key=lambda o: o.get("area") != district)
        return [{"opportunity_id": o["id"], "why": o["description"], "first_step": o["how_to_access"]} for o in same_type[:3]]
