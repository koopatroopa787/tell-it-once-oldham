"""Offline tests for the parts that must never be wrong. No API key needed."""

from __future__ import annotations

import config
from directory import Directory
from safety import check_crisis, redact_pii
from triage import TriageEngine


def test_redacts_common_identifiers() -> None:
    text = "Call me on 07700 900123 or a.b@example.com, I live at BL1 1AA, NI AB123456C."
    clean, found = redact_pii(text)
    for leaked in ("07700", "example.com", "BL1 1AA", "AB123456C"):
        assert leaked not in clean
    assert {"PHONE", "EMAIL", "POSTCODE", "NI_NUMBER"} <= set(found)


def test_ordinary_text_is_left_alone() -> None:
    text = "She is 58, has two children and is six weeks from eviction."
    clean, found = redact_pii(text)
    assert clean == text and found == []


def test_crisis_rules() -> None:
    assert check_crisis("I have nowhere to sleep tonight").label == "Homeless tonight"
    assert check_crisis("he hits me when he drinks").severity == 3
    assert check_crisis("my back hurts me and I lost my job") is None


def test_unknown_services_are_dropped() -> None:
    directory = Directory.load(config.SERVICES_PATH, "Testborough")
    engine = TriageEngine(directory, client=object())
    raw = {
        "one_story": "x",
        "needs": [{"category": "housing", "summary": "notice", "urgency": "urgent"}],
        "handovers": [
            {"service_id": "housing-options", "why": "", "handover_message": "", "phone_script": "", "what_to_bring": ""},
            {"service_id": "made-up-service", "why": "", "handover_message": "", "phone_script": "", "what_to_bring": ""},
        ],
        "unmet_needs": [],
        "plan_for_resident": "p",
        "plan_for_resident_english": "p",
        "questions_to_ask": [],
        "needs_person_today": False,
        "reason_for_person_today": "",
        "confidence": "high",
    }
    plan, dropped = engine._validate(raw)
    assert [h["service_id"] for h in plan["handovers"]] == ["housing-options"]
    assert dropped == ["made-up-service"]
    assert plan["confidence"] == "low"


def test_borough_name_is_filled_in() -> None:
    directory = Directory.load(config.SERVICES_PATH, "Testborough")
    assert directory.get("housing-options")["name"].startswith("Testborough")
