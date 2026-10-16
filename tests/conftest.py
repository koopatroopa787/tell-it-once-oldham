"""Every test writes to a throwaway database, never data/pathly.db."""

import pytest

import api
from db import Database


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Database:
    db = Database(tmp_path / "test.db")
    monkeypatch.setattr(api, "db", db)
    return db
