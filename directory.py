"""Loads the borough's service directory and formats it for the model."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Directory:
    """An in-memory list of services the tool is allowed to recommend."""

    services: list[dict]

    @classmethod
    def load(cls, path: Path, borough: str) -> "Directory":
        raw = json.loads(path.read_text(encoding="utf-8"))
        services = []
        for svc in raw["services"]:
            services.append(
                {k: v.replace("{borough}", borough) if isinstance(v, str) else v for k, v in svc.items()}
            )
        return cls(services)

    @property
    def ids(self) -> set[str]:
        return {svc["id"] for svc in self.services}

    def get(self, service_id: str) -> dict | None:
        for svc in self.services:
            if svc["id"] == service_id:
                return svc
        return None

    def to_prompt(self) -> str:
        """Render the directory as compact text for the system prompt."""
        lines = []
        for svc in self.services:
            lines.append(
                f"- id: {svc['id']} | {svc['name']} ({svc['provider']}) | category: {svc['category']}\n"
                f"  What it does: {svc['description']}\n"
                f"  Who it is for: {svc['who_it_is_for']}\n"
                f"  How to get it: {svc['how_to_access']}"
            )
        return "\n".join(lines)
