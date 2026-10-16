"""Make a tiny live request through the same matching and chat paths as the app."""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from directory import Directory
from matcher import Matcher


def _fail(message: str) -> None:
    print(f"::error title=DeepSeek integration check::{message}")
    raise SystemExit(message)


def _error_kinds(error: Exception) -> str:
    kinds: list[str] = []
    current: BaseException | None = error
    while current is not None and len(kinds) < 4:
        name = type(current).__name__
        if name not in kinds:
            kinds.append(name)
        current = current.__cause__ or current.__context__
    return " -> ".join(kinds)


def _check_official_endpoint() -> None:
    try:
        with urlopen(Request("https://api.deepseek.com", method="HEAD"), timeout=10):
            return
    except HTTPError:
        return
    except URLError as error:
        reason = error.reason if isinstance(error.reason, BaseException) else error
        _fail(f"Official DeepSeek endpoint is unreachable ({_error_kinds(reason)}).")


def _stop_for_api_error(stage: str, error: Exception) -> None:
    error_kinds = _error_kinds(error)
    status_code = getattr(error, "status_code", None)
    if isinstance(status_code, int):
        _fail(f"DeepSeek {stage} request failed with HTTP {status_code} ({error_kinds}).")
    _fail(f"DeepSeek {stage} request failed ({error_kinds}).")


def main() -> None:
    if not config.DEEPSEEK_API_KEY:
        _fail("DEEPSEEK_API_KEY is not available to this workflow.")

    _check_official_endpoint()
    matcher = Matcher(Directory.load(config.OPPORTUNITIES_PATH, config.BOROUGH))
    answers = {
        "path": "exploring",
        "type": "paid_work",
        "interests": "engineering and practical work",
        "experience": "helping at a community event",
        "district": "Central",
    }
    try:
        raw_analysis = matcher._call_analysis(answers)
        analysis = matcher._validate_analysis(raw_analysis, answers["type"])
    except Exception as error:  # noqa: BLE001 - process boundary must report a safe category only
        _stop_for_api_error("matching", error)
    if not analysis.matches:
        _fail("DeepSeek matching returned no approved directory matches.")

    opportunity_ids = [item["opportunity_id"] for item in analysis.matches]
    try:
        raw_reply = matcher._call_chat(
            answers,
            opportunity_ids,
            [],
            "What is one useful thing I can do this week?",
        )
        reply = matcher._validate_chat(raw_reply, opportunity_ids)
    except Exception as error:  # noqa: BLE001 - process boundary must report a safe category only
        _stop_for_api_error("chat", error)
    if not reply.reply:
        _fail("DeepSeek chat returned an empty response.")

    print("DeepSeek matching and chat smoke check passed.")


if __name__ == "__main__":
    main()
