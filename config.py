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

DATA_DIR = ROOT / "data"
SERVICES_PATH = DATA_DIR / "services.json"
OPPORTUNITIES_PATH = DATA_DIR / "opportunities.json"
PERSONAS_PATH = DATA_DIR / "personas.json"
ENQUIRIES_PATH = DATA_DIR / "enquiries.json"
CACHE_PATH = DATA_DIR / "response_cache.json"
