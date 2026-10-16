"""Deterministic safeguards that run before any text reaches the model.

1. PII redaction: common identifiers are replaced with tags, so personal
   details are never sent to the AI provider or stored.
2. Crisis check: fixed, human-written safety information is shown whenever a
   message suggests someone may be at risk, regardless of what the model says.

The crisis rules are English-only keyword patterns. The model is also asked to
flag risk in any language, so the two checks back each other up. This
limitation is stated openly in the README and the About page.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("NI_NUMBER", re.compile(r"\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b", re.IGNORECASE)),
    ("PHONE", re.compile(r"(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b")),
    ("POSTCODE", re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b", re.IGNORECASE)),
    ("LONG_NUMBER", re.compile(r"\b\d{8,}\b")),
]

PII_LABELS = {
    "EMAIL": "email address",
    "NI_NUMBER": "National Insurance number",
    "PHONE": "phone number",
    "POSTCODE": "postcode",
    "LONG_NUMBER": "account or reference number",
}


def redact_pii(text: str) -> tuple[str, list[str]]:
    """Replace personal identifiers with tags. Returns the clean text and the tag types found."""
    found: list[str] = []
    for tag, pattern in PII_PATTERNS:
        text, count = pattern.subn(f"[{tag}]", text)
        if count:
            found.append(tag)
    return text, found


@dataclass(frozen=True)
class CrisisMatch:
    label: str
    severity: int
    message: str


_CRISIS_RULES: list[tuple[str, int, list[str], str]] = [
    (
        "Possible risk to life",
        4,
        [
            r"\bkill myself\b",
            r"\bsuicid",
            r"\bend my life\b",
            r"\bself[- ]?harm",
            r"\bhurt myself\b",
            r"\bdon'?t want to (?:live|be alive|be here) any ?more\b",
        ],
        "If you might act on thoughts of ending your life, call 999 now. "
        "You can talk to Samaritans for free, day or night, on 116 123. "
        "For urgent mental health help, call NHS 111 and choose the mental health option.",
    ),
    (
        "Possible danger or abuse",
        3,
        [
            r"\b(?:hits|hit|beats|beat|threatens|threatened|attacked) me\b",
            r"\bdomestic (?:abuse|violence)\b",
            r"\bnot safe at home\b",
            r"\bscared for my (?:life|safety)\b",
        ],
        "If you are in danger right now, call 999. If you cannot speak, call 999 and press 55 when asked. "
        "The National Domestic Abuse Helpline is free and open 24 hours: 0808 2000 247.",
    ),
    (
        "Homeless tonight",
        2,
        [
            r"\bnowhere to (?:sleep|stay|go) tonight\b",
            r"\bsleeping (?:rough|on the streets?)\b",
            r"\b(?:homeless|kicked out|evicted) (?:tonight|today)\b",
        ],
        "If you have nowhere safe to sleep tonight, contact {borough} Council's homelessness team now. "
        "Out of hours, use the council's emergency line (add the real number before the demo). "
        "Shelter's free helpline is 0808 800 4444.",
    ),
    (
        "No food",
        1,
        [
            r"\bno food\b",
            r"\bhaven'?t eaten\b",
            r"\bcan'?t feed (?:my|the) (?:kids|children|family|baby)\b",
        ],
        "If you have no food today, a local food bank or the council's crisis support can help quickly. "
        "A member of staff will look at your message as a priority.",
    ),
]


def check_crisis(text: str) -> CrisisMatch | None:
    """Return the most severe crisis rule the text matches, if any."""
    lowered = text.lower()
    best: CrisisMatch | None = None
    for label, severity, patterns, message in _CRISIS_RULES:
        if any(re.search(p, lowered) for p in patterns):
            if best is None or severity > best.severity:
                best = CrisisMatch(label=label, severity=severity, message=message)
    return best
