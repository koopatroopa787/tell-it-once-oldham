"""Results: AI-matched opportunities near the young person, with link, phone and contact details."""

from __future__ import annotations

import streamlit as st

import config
from directory import Directory
from flow import answers, back_button, go
from matcher import Matcher
from safety import check_crisis


@st.cache_resource
def get_matcher() -> Matcher:
    return Matcher(Directory.load(config.OPPORTUNITIES_PATH, config.BOROUGH))


def _start_again() -> None:
    for key in ("answers", "result", "result_key", "pathly_chat_history"):
        st.session_state.pop(key, None)
    go("path")


def render() -> None:
    st.title("Options for you")
    given = answers()

    # Fixed safety information first; it never depends on the AI.
    crisis = check_crisis(" ".join(str(v) for v in given.values()))
    if crisis:
        st.error(crisis.message.replace("{borough}", config.BOROUGH))
        back_button("type")
        st.button("Start again", on_click=_start_again)
        return

    key = repr(sorted(given.items()))
    if st.session_state.get("result_key") != key:  # one AI call per set of answers, not per rerun
        with st.spinner("Finding options near you..."):
            st.session_state.result = get_matcher().run(given)
        st.session_state.result_key = key
        st.session_state.pathly_chat_history = []
    result = st.session_state.result

    if result.summary:
        st.text(result.summary)

    if result.possible_directions:
        st.subheader("Directions you could explore")
        for direction in result.possible_directions:
            st.text(f"{direction['title']} — {direction['why']}")

    directory = get_matcher().directory
    for match in result.matches:
        opp = directory.get(match["opportunity_id"])
        with st.container(border=True):
            st.subheader(opp["name"])
            st.caption(f"{opp['provider']} | {opp.get('area', '')}")
            st.text(match["why"])
            if match.get("first_step"):
                st.text(f"First step: {match['first_step']}")
            if opp.get("phone"):
                st.markdown(f"**Phone:** {opp['phone']}")
            if opp.get("contact"):
                st.markdown(f"**Contact:** {opp['contact']}")
            if opp.get("link"):
                st.link_button("Find out more", opp["link"])

    if not result.used_ai:
        st.caption("Showing a simple match because the AI service is not available right now.")

    st.subheader("Ask Pathly")
    st.caption("Ask about the options above. Do not include your name, address, phone number or email.")
    history = st.session_state.setdefault("pathly_chat_history", [])
    for item in history:
        with st.chat_message(item["role"]):
            st.text(item["content"])

    question = st.chat_input("What jobs could suit me, or what should I do first?")
    if question:
        matched_ids = [match["opportunity_id"] for match in result.matches]
        with st.spinner("Thinking about your options..."):
            reply = get_matcher().chat(
                answers=given,
                matched_opportunity_ids=matched_ids,
                history=history,
                message=question,
            )
        reply_text = reply.reply
        if reply.needs_human_support:
            reply_text += " Please talk this through with a trusted adult or local adviser today."
        st.session_state.pathly_chat_history = [
            *history,
            {"role": "user", "content": question},
            {"role": "assistant", "content": reply_text},
        ]
        st.rerun()

    st.caption("Sample data for a demo. Check details with the organisation before you go.")
    back_button("type")
    st.button("Start again", on_click=_start_again)
