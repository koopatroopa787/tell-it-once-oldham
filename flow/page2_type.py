"""Page 2: what kind of opportunity are you looking for?"""

from __future__ import annotations

import streamlit as st

from flow import answers, back_button, go

# Keys match `category` in data/opportunities.json.
# ponytail: "Social work" is the wireframe's label; meaning TBC (social care careers vs community action).
OPPORTUNITY_TYPES = {
    "voluntary": "Voluntary",
    "paid_work": "Paid work",
    "social_work": "Social work",
}


def _choose(kind: str) -> None:
    answers()["type"] = kind
    go("student" if answers().get("path") == "student" else "explore")


def render() -> None:
    st.title("What are you looking for?")
    for col, (kind, label) in zip(st.columns(len(OPPORTUNITY_TYPES)), OPPORTUNITY_TYPES.items()):
        col.button(label, on_click=_choose, args=(kind,), use_container_width=True)
    back_button("path")
