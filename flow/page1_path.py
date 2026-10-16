"""Page 1: are you a student, or exploring your options?"""

from __future__ import annotations

import streamlit as st

import config
from flow import answers, go


def _choose(path: str) -> None:
    answers()["path"] = path
    go("type")


def render() -> None:
    st.title("What's next for you?")
    st.write(f"Find volunteering, paid work and social opportunities in {config.BOROUGH}. It takes about two minutes.")
    left, right = st.columns(2)
    left.button("I'm a student", on_click=_choose, args=("student",), use_container_width=True, type="primary")
    right.button("I'm exploring my options", on_click=_choose, args=("explore",), use_container_width=True)
