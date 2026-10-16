"""Shared helpers for the young people's flow. Each page lives in its own module so teammates can work in parallel.

Flow (from the team wireframe):
    path -> type -> student | explore -> results
"""

from __future__ import annotations

import streamlit as st

# Oldham Council's five districts (oldham.gov.uk, Neighbourhoods).
DISTRICTS = ["Anywhere in Oldham", "Central", "East", "North", "South", "West"]


def answers() -> dict:
    """Everything the young person has told us so far, kept in the session only."""
    return st.session_state.setdefault("answers", {})


def go(step: str) -> None:
    """Move to another page. Use as a button callback: st.button(..., on_click=go, args=("type",))."""
    st.session_state.step = step


def back_button(step: str) -> None:
    st.button("Back", on_click=go, args=(step,))
