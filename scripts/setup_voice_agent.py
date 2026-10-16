"""Create Pathly's ElevenLabs voice agent and save its id to .env, so nobody has to click through the dashboard.

Run once, after putting ELEVENLABS_API_KEY in the repo-root .env:

    python scripts/setup_voice_agent.py

It creates the `find_opportunities` client tool and an agent that uses it (with signed-URL authentication on), then
writes ELEVENLABS_AGENT_ID into .env. If .env already has an agent id it does nothing. The key is never printed.
The agent mirrors the manual setup in web/README.md; keep the two in step.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
API = "https://api.elevenlabs.io/v1/convai"

FIRST_MESSAGE = (
    "Hi, I'm Pathly. I help young people in Oldham find volunteering, jobs and things to get involved in. "
    "Are you studying at the moment, or exploring your options?"
)
PROMPT = """You are Pathly, a friendly voice guide for young people in Oldham. Keep every reply to one or two short sentences and ask one question at a time.
Find out, in this order:
1. path: "student" if they are studying, otherwise "explore".
2. type: "voluntary", "paid_work" or "social_work" (social means clubs, groups and activities).
3. If student: hobbies, then what they study. If exploring: interests, then any past work or experience.
4. district: Central, East, North, South or West Oldham, or "Anywhere in Oldham".
Then call find_opportunities with what you heard. Read out the matches briefly, with each first step, and say the full details are on screen.
If the tool returns a crisis message, say it first, calmly, before anything else.
Never ask for or repeat a name, address, phone number, school name or date of birth. If they share one, do not use it.
Only mention opportunities the tool returned. Never promise a place, a job or eligibility; say they can contact the provider to check."""


def _text(description: str, enum: list[str] | None = None) -> dict:
    field = {"type": "string", "description": description}
    if enum:
        field["enum"] = enum
    return field


TOOL = {
    "type": "client",
    "name": "find_opportunities",
    "description": "Find real Oldham opportunities that match what the young person said.",
    "expects_response": True,
    "response_timeout_secs": 30,
    "parameters": {
        "type": "object",
        "required": ["path", "type"],
        "properties": {
            "path": _text("student if they are studying, otherwise explore", ["student", "explore"]),
            "type": _text("What they are looking for", ["voluntary", "paid_work", "social_work"]),
            "district": _text("Where in Oldham", ["Anywhere in Oldham", "Central", "East", "North", "South", "West"]),
            "hobbies": _text("Students: what they enjoy in their free time"),
            "studies": _text("Students: what they are studying"),
            "interests": _text("Exploring: what they are interested in"),
            "experience": _text("Exploring: any past work or experience"),
        },
    },
}


def read_env() -> dict[str, str]:
    values = {}
    for line in ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []:
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def save_agent_id(agent_id: str) -> None:
    text = ENV.read_text(encoding="utf-8")
    if re.search(r"^ELEVENLABS_AGENT_ID=.*$", text, flags=re.M):
        text = re.sub(r"^ELEVENLABS_AGENT_ID=.*$", f"ELEVENLABS_AGENT_ID={agent_id}", text, flags=re.M)
    else:
        text = text.rstrip("\n") + f"\nELEVENLABS_AGENT_ID={agent_id}\n"
    ENV.write_text(text, encoding="utf-8")


def post(path: str, key: str, body: dict) -> dict:
    response = httpx.post(f"{API}{path}", headers={"xi-api-key": key}, json=body, timeout=30)
    if response.status_code >= 400:
        sys.exit(f"ElevenLabs refused {path} ({response.status_code}): {response.text[:400]}")
    return response.json()


def main() -> None:
    env = read_env()
    key = env.get("ELEVENLABS_API_KEY", "")
    if not key:
        sys.exit("Put ELEVENLABS_API_KEY in .env first (see .env.example).")
    if env.get("ELEVENLABS_AGENT_ID"):
        print("ELEVENLABS_AGENT_ID is already set in .env; nothing to do.")
        return

    tool_id = post("/tools", key, {"tool_config": TOOL})["id"]
    agent = post("/agents/create", key, {
        "name": "Pathly Oldham",
        "conversation_config": {
            "agent": {"first_message": FIRST_MESSAGE, "language": "en", "prompt": {"prompt": PROMPT, "tool_ids": [tool_id]}},
            "tts": {"voice_id": env.get("ELEVENLABS_VOICE_ID") or "JBFqnCBsd6RMkjVDRZzb"},
        },
        "platform_settings": {"auth": {"enable_auth": True}},  # only signed URLs from /api/voice/session can start a call
    })
    save_agent_id(agent["agent_id"])
    print(f"Created the Pathly agent ({agent['agent_id']}) and saved ELEVENLABS_AGENT_ID to .env. Restart uvicorn.")


if __name__ == "__main__":
    main()
