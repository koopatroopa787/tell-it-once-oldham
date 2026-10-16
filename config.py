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

DATA_DIR = ROOT / "data"
SERVICES_PATH = DATA_DIR / "services.json"
OPPORTUNITIES_PATH = DATA_DIR / "opportunities.json"
PERSONAS_PATH = DATA_DIR / "personas.json"
ENQUIRIES_PATH = DATA_DIR / "enquiries.json"
CACHE_PATH = DATA_DIR / "response_cache.json"
