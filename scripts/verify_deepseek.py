"""Make a tiny live request through the same matching and chat paths as the app."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from directory import Directory
from matcher import Matcher


def main() -> None:
    if not config.DEEPSEEK_API_KEY:
        raise SystemExit("DEEPSEEK_API_KEY is not available to this workflow.")

    matcher = Matcher(Directory.load(config.OPPORTUNITIES_PATH, config.BOROUGH))
    answers = {
        "path": "exploring",
        "type": "paid_work",
        "interests": "engineering and practical work",
        "experience": "helping at a community event",
        "district": "Central",
    }
    analysis = matcher.run(answers)
    if not analysis.used_ai or not analysis.matches:
        raise SystemExit("DeepSeek matching did not return a grounded AI result.")

    opportunity_ids = [item["opportunity_id"] for item in analysis.matches]
    reply = matcher.chat(
        answers=answers,
        matched_opportunity_ids=opportunity_ids,
        history=[],
        message="What is one useful thing I can do this week?",
    )
    if not reply.used_ai or not reply.reply:
        raise SystemExit("DeepSeek chat did not return a grounded AI response.")

    print("DeepSeek matching and chat smoke check passed.")


if __name__ == "__main__":
    main()
