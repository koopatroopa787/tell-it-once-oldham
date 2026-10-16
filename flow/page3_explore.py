"""Page 3 (exploring for options): interests and any past work or experience."""

from __future__ import annotations

import streamlit as st

from flow import DISTRICTS, answers, back_button, go


def render() -> None:
    st.title("Tell us a bit about you")
    with st.form("explore"):
        interests = st.text_area("What are you interested in?", value=answers().get("interests", ""))
        experience = st.text_area(
            "Any past work or experience? Anything counts: helping family, clubs, part-time jobs.",
            value=answers().get("experience", ""),
        )
        district = st.selectbox("Where in Oldham are you?", DISTRICTS)
        st.caption("Please don't include your name, full address, phone, email, date of birth or school name.")
        if st.form_submit_button("Show me options", type="primary"):
            answers().update(interests=interests, experience=experience, district=district)
            go("results")
            st.rerun()
    back_button("type")
