"""Local SQLite database: every match, chat turn and uploaded document, kept on our own server.

Only text that has already been through redact_pii is written, so names, phone numbers,
emails and addresses never reach the file. Rows are linked by a random per-visit session id.

Look inside:  python db.py            (counts and the latest rows)
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

import config

PATH = config.DATA_DIR / "pathly.db"
TABLES = ("matches", "chats", "documents")
SCHEMA = """
CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, at TEXT NOT NULL, session TEXT,
  answers TEXT NOT NULL, crisis TEXT, used_ai INTEGER NOT NULL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, at TEXT NOT NULL, session TEXT,
  message TEXT NOT NULL, reply TEXT NOT NULL, used_ai INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, at TEXT NOT NULL, session TEXT,
  kind TEXT NOT NULL, text TEXT NOT NULL, removed TEXT NOT NULL);
"""
_SESSION = re.compile(r"[A-Za-z0-9-]{8,64}")


def session_id(value: str | None) -> str | None:
    """The browser's random visit id, or None if it is missing or not one of ours."""
    return value if value and _SESSION.fullmatch(value) else None


class Database:
    def __init__(self, path: Path = PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        # ponytail: one connection behind a lock; a pool or Postgres if traffic outgrows a demo
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)

    def save(self, table: str, session: str | None, **fields: object) -> None:
        assert table in TABLES
        row = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "session": session}
        row.update({k: v if isinstance(v, (str, int, type(None))) else json.dumps(v, ensure_ascii=False) for k, v in fields.items()})
        sql = f"INSERT INTO {table} ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})"
        with self._lock, self._conn:
            self._conn.execute(sql, list(row.values()))

    def rows(self, table: str, limit: int = 20) -> list[dict]:
        assert table in TABLES
        with self._lock:
            return [dict(r) for r in self._conn.execute(f"SELECT * FROM {table} ORDER BY id DESC LIMIT ?", (limit,))]

    def count(self, table: str) -> int:
        assert table in TABLES
        with self._lock:
            return self._conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


if __name__ == "__main__":
    db = Database(Path(sys.argv[1]) if len(sys.argv) > 1 else PATH)
    for table in TABLES:
        print(f"\n{table}: {db.count(table)} rows")
        for row in db.rows(table, 5):
            print("  ", {k: (v[:80] + "...") if isinstance(v, str) and len(v) > 80 else v for k, v in row.items()})
