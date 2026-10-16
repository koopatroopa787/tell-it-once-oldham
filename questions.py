"""The questions Pathly asks, from the team wireframe. The API serves these so the website never hard-codes them.

Flow:
    path (student | explore) -> type -> questions for that path -> results
"""

from __future__ import annotations

from typing import Any

import config

PATHS: dict[str, str] = {
    "student": "I'm a student",
    "explore": "I'm exploring my options",
}

# Keys match `category` in data/opportunities.json.
# ponytail: "Social work" is the wireframe's label; meaning TBC (social care careers vs community action).
OPPORTUNITY_TYPES: dict[str, str] = {
    "voluntary": "Voluntary",
    "paid_work": "Paid work",
    "social_work": "Social work",
}

# Oldham Council's five districts (oldham.gov.uk, Neighbourhoods).
DISTRICTS: list[str] = ["Anywhere in Oldham", "Central", "East", "North", "South", "West"]

_DISTRICT_QUESTION: dict[str, Any] = {
    "key": "district",
    "label": f"Where in {config.BOROUGH} are you?",
    "kind": "choice",
    "options": DISTRICTS,
}

QUESTIONS: dict[str, list[dict[str, Any]]] = {
    "student": [
        {"key": "hobbies", "label": "What do you enjoy doing in your free time?", "kind": "long_text"},
        {"key": "studies", "label": "What are you studying at the moment?", "kind": "short_text"},
        _DISTRICT_QUESTION,
    ],
    "explore": [
        {"key": "interests", "label": "What are you interested in?", "kind": "long_text"},
        {
            "key": "experience",
            "label": "Any past work or experience? Anything counts: helping family, clubs, part-time jobs.",
            "kind": "long_text",
        },
        _DISTRICT_QUESTION,
    ],
}

PRIVACY_NOTE = "Please don't include your name, address or phone number."
