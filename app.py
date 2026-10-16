"""Pathly: helps young people in Oldham find volunteering, paid work and social opportunities.

Run with:  streamlit run app.py
The earlier connector-facing prototype is still available: streamlit run connector_app.py
"""

from __future__ import annotations

import streamlit as st

import config
from flow import go, page1_path, page2_type, page3_explore, page3_student, results

st.set_page_config(page_title=f"Pathly | {config.BOROUGH}", layout="centered")

PAGES = {
    "path": page1_path.render,
    "type": page2_type.render,
    "student": page3_student.render,
    "explore": page3_explore.render,
    "results": results.render,
}

st.session_state.setdefault("step", "path")
st.sidebar.title("Pathly")
st.sidebar.button("Start again", on_click=lambda: (st.session_state.update(answers={}), go("path")))
PAGES[st.session_state.step]()
