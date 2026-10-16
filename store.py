"""A tiny JSON-file store for cases. Good enough for a demo; swap for a database later."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

URGENCY_RANK = {"urgent": 0, "this_week": 1, "routine": 2}


class CaseStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def all(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []

    def get(self, case_id: str) -> dict | None:
        return next((c for c in self.all() if c["id"] == case_id), None)

    def upsert(self, case: dict) -> None:
        cases = [c for c in self.all() if c["id"] != case["id"]]
        cases.append(case)
        self._write(cases)

    def update_handover(self, case_id: str, service_id: str, status: str) -> None:
        cases = self.all()
        for case in cases:
            if case["id"] != case_id:
                continue
            for handover in case["plan"]["handovers"]:
                if handover["service_id"] == service_id:
                    handover["status"] = status
        self._write(cases)

    def update(self, case_id: str, **fields: Any) -> None:
        cases = self.all()
        for case in cases:
            if case["id"] == case_id:
                case.update(fields)
        self._write(cases)

    def clear(self) -> None:
        self._write([])

    def _write(self, cases: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")


def priority_key(case: dict) -> tuple:
    """Sort order for the handover queue: safety first, then same-day, then urgency, newest first within ties."""
    needs = case.get("plan", {}).get("needs", [])
    top_urgency = min((URGENCY_RANK.get(n.get("urgency"), 3) for n in needs), default=3)
    return (
        0 if case.get("crisis") else 1,
        0 if case.get("plan", {}).get("needs_person_today") else 1,
        top_urgency,
        "".join(chr(255 - ord(ch)) for ch in case.get("created_at", "")),
    )
