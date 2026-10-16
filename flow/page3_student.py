"""Page 3 (students): hobbies and current studies."""

from __future__ import annotations

import streamlit as st

from flow import DISTRICTS, answers, back_button, go


def render() -> None:
    st.title("Tell us a bit about you")
    with st.form("student"):
        hobbies = st.text_area("What do you enjoy doing in your free time?", value=answers().get("hobbies", ""))
        studies = st.text_input("What are you studying at the moment?", value=answers().get("studies", ""))
        district = st.selectbox("Where in Oldham are you?", DISTRICTS)
        st.caption("Please don't include your name, full address, phone, email, date of birth or school name.")
        if st.form_submit_button("Show me options", type="primary"):
            answers().update(hobbies=hobbies, studies=studies, district=district)
            go("results")
            st.rerun()
    back_button("type")
