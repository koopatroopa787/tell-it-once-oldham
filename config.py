"""Central configuration. Override any value in a .env file next to this one."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

BOROUGH: str = os.getenv("BOROUGH", "Oldham")
MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MAX_TOKENS: int = int(os.getenv("MAX_TOKENS", "4000"))

# Pathly uses DeepSeek through its Anthropic-compatible server. The key stays
# server-side; never expose it through Streamlit state or browser JavaScript.
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
DEEPSEEK_MAX_TOKENS: int = int(os.getenv("DEEPSEEK_MAX_TOKENS", "1400"))
DEEPSEEK_TIMEOUT_SECONDS: float = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "15"))

# ElevenLabs voice (read results aloud, speak your answers). Without a key the site is text only.
ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
ELEVENLABS_TTS_MODEL: str = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
ELEVENLABS_STT_MODEL: str = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
VOICE_TIMEOUT: float = float(os.getenv("VOICE_TIMEOUT", "30"))
# Voice calls use your paid ElevenLabs credits, so each visitor gets this many per 10 minutes.
VOICE_LIMIT_PER_10_MIN: int = int(os.getenv("VOICE_LIMIT_PER_10_MIN", "40"))
# Ask Pathly chat questions per visitor per 10 minutes, to protect the DeepSeek budget.
CHAT_LIMIT_PER_10_MIN: int = int(os.getenv("CHAT_LIMIT_PER_10_MIN", "30"))

# Websites allowed to call the API, comma separated. Defaults cover the Vite and Create React App dev servers.
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()
]

DATA_DIR = ROOT / "data"
SERVICES_PATH = DATA_DIR / "services.json"
OPPORTUNITIES_PATH = DATA_DIR / "opportunities.json"
PERSONAS_PATH = DATA_DIR / "personas.json"
ENQUIRIES_PATH = DATA_DIR / "enquiries.json"
CACHE_PATH = DATA_DIR / "response_cache.json"
