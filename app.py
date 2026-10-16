"""Tell It Once: an AI copilot for Live Well community connectors.

A connector sits with a resident and writes down their story once. The tool
turns it into linked needs, matched local offers, warm handovers (message and
phone script) and a take-home plan in the resident's language. Staff stay in
charge of every step.

Run with:  streamlit run app.py
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pandas as pd
import streamlit as st

import config
from directory import Directory
from plan_export import render_plan_html
from safety import PII_LABELS, check_crisis, redact_pii
from store import CaseStore, priority_key
from triage import CATEGORY_LABELS, TriageEngine, TriageError

st.set_page_config(page_title=f"Tell It Once | {config.BOROUGH}", layout="wide")

LANGUAGES = [
    "English", "Urdu", "Bengali", "Polish", "Arabic", "Punjabi", "Romanian", "Somali",
    "Kurdish (Sorani)", "Farsi", "Pashto", "Chinese (Mandarin)", "Gujarati", "Ukrainian", "Tigrinya",
]
CHANNELS = [
    "Live Well Centre drop-in",
    "Live Well Space (community venue)",
    "Outreach or home visit",
    "Phone",
]
# Oldham Council's five districts (oldham.gov.uk, Neighbourhoods).
DISTRICTS = ["Not recorded", "Central", "East", "North", "South", "West"]
HANDOVER_STATUSES = [
    "Not started",
    "Phoned and accepted",
    "Message sent",
    "Resident will contact them",
    "Not suitable",
]
DONE_STATUSES = {"Phoned and accepted", "Message sent", "Resident will contact them"}
URGENCY_LABELS = {"urgent": "Urgent", "this_week": "This week", "routine": "Routine"}


# ---------------------------------------------------------------------------
# Shared resources
# ---------------------------------------------------------------------------

@st.cache_resource
def get_directory() -> Directory:
    return Directory.load(config.SERVICES_PATH, config.BOROUGH)


@st.cache_resource
def get_engine() -> TriageEngine:
    return TriageEngine(get_directory())


@st.cache_resource
def get_store() -> CaseStore:
    return CaseStore(config.ENQUIRIES_PATH)


@st.cache_data
def load_personas() -> list[dict]:
    import json

    return json.loads(config.PERSONAS_PATH.read_text(encoding="utf-8"))["personas"]


@st.cache_resource
def get_transcriber():
    """Optional voice notes. Only active if faster-whisper is installed."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    import os

    return WhisperModel(os.getenv("WHISPER_MODEL", "base"), device="cpu", compute_type="int8")


# ---------------------------------------------------------------------------
# State and callbacks
# ---------------------------------------------------------------------------

def init_state() -> None:
    st.session_state.setdefault("notes", "")
    st.session_state.setdefault("language", "English")
    st.session_state.setdefault("channel", CHANNELS[0])
    st.session_state.setdefault("district", DISTRICTS[0])
    st.session_state.setdefault("consent", False)
    st.session_state.setdefault("current_case_id", None)


def load_persona(index: int) -> None:
    persona = load_personas()[index]
    st.session_state.notes = persona["notes"]
    st.session_state.language = persona["language"]
    st.session_state.district = persona.get("district", DISTRICTS[0])
    st.session_state.consent = True
    st.session_state.current_case_id = None


def start_new() -> None:
    st.session_state.notes = ""
    st.session_state.language = "English"
    st.session_state.district = DISTRICTS[0]
    st.session_state.consent = False
    st.session_state.current_case_id = None


def transcribe_voice() -> None:
    audio = st.session_state.get("voice")
    model = get_transcriber()
    if audio is None or model is None:
        return
    segments, _info = model.transcribe(audio)
    text = " ".join(segment.text.strip() for segment in segments)
    st.session_state.notes = (st.session_state.notes + "\n" + text).strip()


def build_plan() -> None:
    notes = st.session_state.notes.strip()
    if not notes:
        st.session_state.flash = ("warning", "Add some notes first.")
        return
    if not st.session_state.consent:
        st.session_state.flash = ("warning", "Please confirm the resident has agreed before continuing.")
        return

    redacted, found = redact_pii(notes)
    crisis = check_crisis(notes)
    try:
        result = get_engine().run(redacted, st.session_state.language)
    except TriageError as exc:
        message = f"The AI service is unavailable ({exc}). Carry on with the resident as usual and try again shortly."
        if crisis:
            # Safety information never depends on the AI being reachable.
            message = f"Safety information to share now. {crisis.message.replace('{borough}', config.BOROUGH)} {message}"
        st.session_state.flash = ("error", message)
        return

    plan = result.plan
    if crisis:
        plan["needs_person_today"] = True
        plan["reason_for_person_today"] = f"Safety check: {crisis.label}. {plan['reason_for_person_today']}".strip()

    case = {
        "id": uuid.uuid4().hex[:8],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "language": st.session_state.language,
        "channel": st.session_state.channel,
        "district": st.session_state.district,
        "notes_redacted": redacted,
        "redactions": found,
        "crisis": crisis.label if crisis else None,
        "crisis_message": crisis.message.replace("{borough}", config.BOROUGH) if crisis else None,
        "plan": plan,
        "from_cache": result.from_cache,
        "dropped_service_ids": result.dropped_service_ids,
        "handover_consent": False,
        "status": "Open",
    }
    get_store().upsert(case)
    st.session_state.current_case_id = case["id"]


def show_flash() -> None:
    flash = st.session_state.pop("flash", None)
    if flash:
        kind, message = flash
        getattr(st, kind)(message)


# ---------------------------------------------------------------------------
# Page: conversation
# ---------------------------------------------------------------------------

def page_conversation() -> None:
    st.title("Tell It Once")
    st.write(
        f"{config.BOROUGH} Live Well. Write down the resident's story once. "
        "You get a plan, warm handovers and a take-home sheet in their language."
    )

    with st.expander("Demo residents (synthetic, no real data)"):
        for index, persona in enumerate(load_personas()):
            st.button(persona["label"], key=f"persona_{index}", on_click=load_persona, args=(index,))

    left, right = st.columns([3, 2])
    with left:
        st.text_area(
            "Your notes from the conversation",
            key="notes",
            height=220,
            placeholder="What is going on for them, in your words or theirs. Any language is fine.",
        )
        if get_transcriber() is not None:
            st.audio_input("Or record a voice note (added to the notes)", key="voice", on_change=transcribe_voice)
    with right:
        st.selectbox("Resident's preferred language", LANGUAGES, key="language")
        st.selectbox("Where is this conversation happening?", CHANNELS, key="channel")
        st.selectbox("District", DISTRICTS, key="district", help="Used only for the anonymised neighbourhood view.")
        st.checkbox("The resident knows I am using this tool and is happy for me to note their situation", key="consent")
        st.caption("Do not type names, addresses, phone numbers or NI numbers. If you do, they are removed before anything is processed.")
        st.button("Build the plan", type="primary", on_click=build_plan)
        st.button("Start a new conversation", on_click=start_new)

    show_flash()

    case_id = st.session_state.current_case_id
    case = get_store().get(case_id) if case_id else None
    if case:
        render_case(case)


def render_case(case: dict) -> None:
    directory = get_directory()
    store = get_store()
    plan = case["plan"]

    st.divider()
    if case.get("crisis_message"):
        st.error(f"Safety information to share now. {case['crisis_message']}")
    if plan["needs_person_today"]:
        st.warning(f"Needs a person today. {plan['reason_for_person_today']}")

    if case["redactions"]:
        labels = ", ".join(PII_LABELS.get(tag, tag) for tag in case["redactions"])
        st.caption(f"Removed before processing: {labels}.")

    col_story, col_needs = st.columns([3, 2])
    with col_story:
        st.subheader("Their story, told once")
        with st.container(border=True):
            st.write(plan["one_story"])
        st.caption("This is what receiving services see, so the resident does not have to repeat it.")
    with col_needs:
        st.subheader("Needs")
        if plan["needs"]:
            st.dataframe(
                pd.DataFrame(
                    [
                        {
                            "Need": CATEGORY_LABELS[n["category"]],
                            "Detail": n["summary"],
                            "When": URGENCY_LABELS[n["urgency"]],
                        }
                        for n in plan["needs"]
                    ]
                ),
                hide_index=True,
            )
        if plan["questions_to_ask"]:
            st.markdown("**Worth asking next**")
            for question in plan["questions_to_ask"]:
                st.markdown(f"- {question}")

    st.subheader("Warm handovers")
    consent = st.checkbox(
        "The resident agrees to share their story with the services below",
        value=case.get("handover_consent", False),
        key=f"handover_consent_{case['id']}",
    )
    if consent != case.get("handover_consent", False):
        store.update(case["id"], handover_consent=consent)

    for handover in plan["handovers"]:
        svc = directory.get(handover["service_id"])
        if svc is None:
            continue
        with st.container(border=True):
            st.markdown(f"**{svc['name']}**  \n{svc['provider']}")
            st.write(handover["why"])
            tab_phone, tab_message, tab_details = st.tabs(["Phone script", "Handover message", "Contact and access"])
            with tab_phone:
                st.write(handover["phone_script"])
            with tab_message:
                st.code(handover["handover_message"], language=None, wrap_lines=True)
            with tab_details:
                st.markdown(f"**Contact:** {svc.get('contact', '')}")
                st.markdown(f"**How to get it:** {svc['how_to_access']}")
                st.markdown(f"**Bring:** {handover['what_to_bring']}")
                st.caption(f"Source: {config.BOROUGH} service directory, record '{svc['id']}' (sample data).")
            status = st.selectbox(
                "Status",
                HANDOVER_STATUSES,
                index=HANDOVER_STATUSES.index(handover.get("status", "Not started")),
                key=f"status_{case['id']}_{svc['id']}",
                disabled=not consent,
                help="Ask the resident for consent above before contacting a service.",
            )
            if status != handover.get("status"):
                store.update_handover(case["id"], svc["id"], status)

    if plan["unmet_needs"]:
        st.warning("No local offer found for: " + "; ".join(plan["unmet_needs"]))
        st.caption("Logged for the neighbourhood view, so the council can see where support is missing.")

    st.subheader("Take-home plan")
    if case["language"] == "English":
        with st.container(border=True):
            st.write(plan["plan_for_resident"])
    else:
        col_theirs, col_english = st.columns(2)
        with col_theirs:
            st.markdown(f"**{case['language']}**")
            with st.container(border=True):
                st.write(plan["plan_for_resident"])
        with col_english:
            st.markdown("**English, so you can check it**")
            with st.container(border=True):
                st.write(plan["plan_for_resident_english"])
        st.caption("Machine translation. Check key details with the resident or an interpreter before they leave.")
    st.download_button(
        "Download printable plan",
        data=render_plan_html(case, directory, config.BOROUGH),
        file_name=f"my_plan_{case['id']}.html",
        mime="text/html",
    )

    notes = []
    if case["from_cache"]:
        notes.append("Shown from a saved response because the AI service was unreachable.")
    if case["dropped_service_ids"]:
        notes.append(
            f"{len(case['dropped_service_ids'])} suggestion(s) were removed because they were not in the "
            "verified directory."
        )
    if plan["confidence"] == "low":
        notes.append("Low confidence: check the plan carefully with the resident.")
    for note in notes:
        st.caption(note)


# ---------------------------------------------------------------------------
# Page: handover queue
# ---------------------------------------------------------------------------

def case_title(case: dict) -> str:
    plan = case["plan"]
    if case.get("crisis"):
        flag = "SAFETY"
    elif plan["needs_person_today"]:
        flag = "TODAY"
    else:
        flag = "Open" if case.get("status") == "Open" else case.get("status", "Open")
    done = sum(1 for h in plan["handovers"] if h.get("status") in DONE_STATUSES)
    story = plan["one_story"][:80] + ("..." if len(plan["one_story"]) > 80 else "")
    return f"{flag} | {story} | {case['language']} | handovers {done}/{len(plan['handovers'])}"


def page_handovers() -> None:
    st.title("Handovers")
    st.caption("Every case in one place, safety and same-day cases first. The AI drafts; people decide and make the calls.")
    store = get_store()
    cases = sorted(store.all(), key=priority_key)
    if not cases:
        st.info("No cases yet. Build a plan on the Conversation page.")
        return

    handovers = [h for c in cases for h in c["plan"]["handovers"]]
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Cases", len(cases))
    m2.metric("Need a person today", sum(1 for c in cases if c["plan"]["needs_person_today"]))
    m3.metric("Handovers completed", f"{sum(1 for h in handovers if h.get('status') in DONE_STATUSES)} of {len(handovers)}")
    m4.metric("Gaps logged", sum(len(c["plan"]["unmet_needs"]) for c in cases))

    directory = get_directory()
    for case in cases:
        with st.expander(case_title(case), expanded=bool(case.get("crisis"))):
            st.write(case["plan"]["one_story"])
            for handover in case["plan"]["handovers"]:
                svc = directory.get(handover["service_id"])
                name = svc["name"] if svc else handover["service_id"]
                st.markdown(f"- {name}: **{handover.get('status', 'Not started')}**")
            cols = st.columns(3)
            if cols[0].button("Open in conversation view", key=f"open_{case['id']}"):
                st.session_state.current_case_id = case["id"]
                st.session_state.page = "Conversation"
                st.rerun()
            if cols[1].button("Mark case closed", key=f"close_{case['id']}"):
                store.update(case["id"], status="Closed")
                st.rerun()
            cols[2].caption(f"{case['channel']}, {case['created_at'][:16].replace('T', ' ')} UTC")


# ---------------------------------------------------------------------------
# Page: neighbourhood insights
# ---------------------------------------------------------------------------

def page_insights() -> None:
    st.title(f"What residents in {config.BOROUGH} are telling us")
    st.caption(
        "Built only from anonymised case records: categories, languages and gaps. No personal details are stored. "
        "Today this picture is split across dozens of organisations."
    )
    cases = get_store().all()
    if not cases:
        st.info("No cases yet.")
        return

    need_counts = [len({n["category"] for n in c["plan"]["needs"]}) for c in cases]
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Cases", len(cases))
    m2.metric("Average linked needs per case", f"{sum(need_counts) / len(cases):.1f}")
    m3.metric("Cases with 3 or more needs", f"{sum(1 for n in need_counts if n >= 3)}")
    m4.metric("Not in English", f"{sum(1 for c in cases if c['language'] != 'English')}")

    directory = get_directory()
    col_a, col_b = st.columns(2)
    with col_a:
        st.subheader("Needs raised")
        needs = [CATEGORY_LABELS[n["category"]] for c in cases for n in c["plan"]["needs"]]
        if needs:
            st.bar_chart(pd.Series(needs).value_counts(), horizontal=True)
    with col_b:
        st.subheader("Services residents were handed to")
        services = [
            (directory.get(h["service_id"]) or {"name": h["service_id"]})["name"]
            for c in cases
            for h in c["plan"]["handovers"]
        ]
        if services:
            st.bar_chart(pd.Series(services).value_counts(), horizontal=True)

    col_c, col_d = st.columns(2)
    with col_c:
        st.subheader("Languages")
        st.bar_chart(pd.Series([c["language"] for c in cases]).value_counts(), horizontal=True)
    with col_d:
        st.subheader("Where conversations happen")
        st.bar_chart(pd.Series([c["channel"] for c in cases]).value_counts(), horizontal=True)

    st.subheader("Cases by district")
    st.bar_chart(pd.Series([c.get("district", "Not recorded") for c in cases]).value_counts(), horizontal=True)

    st.subheader("Gaps: needs with no local offer")
    gaps = [
        {"Need": gap, "District": c.get("district", "Not recorded"), "Case": c["id"]}
        for c in cases
        for gap in c["plan"]["unmet_needs"]
    ]
    if gaps:
        st.dataframe(pd.DataFrame(gaps), hide_index=True)
        st.caption("Evidence for commissioning: where residents are asking for help the borough does not yet offer.")
    else:
        st.write("No gaps logged yet.")


# ---------------------------------------------------------------------------
# Page: about
# ---------------------------------------------------------------------------

def page_about() -> None:
    st.title("How Tell It Once works")
    st.markdown(
        f"""
**The problem.** Live Well Centres and Spaces are becoming the front door to support in {config.BOROUGH}.
Connectors and volunteers are expected to know every offer across money, housing, work and health, and to make
warm handovers so no one has to keep retelling their story. Council chatbots help people who are already online
and confident. They do not reach the residents who walk into a community centre with a carrier bag of letters.

**Why {config.BOROUGH}.** Oldham has the youngest population in Greater Manchester (22.7% under 16) and around 30% of
working-age residents are economically inactive, against 20.9% nationally. Across the city region 37% of under-16s
live in poverty, and families are often juggling debt, housing and health with several agencies at once. Atom Valley
and new Metrolink stops will bring jobs; residents need a clear route to them. (GMCA Census briefing, Get GM Working
plan, GM Labour Market Insights Pack, Autumn 2025.)

**What the tool does.**
1. The connector writes notes, in any language, with the resident's agreement.
2. Personal identifiers are removed and a fixed safety check runs before any AI is involved.
3. The AI turns the notes into one story, linked needs and urgency.
4. It matches needs only to services in the borough's verified directory. Anything it suggests that is not in the
   directory is removed automatically.
5. It drafts a handover message and a phone script for each service, plus a take-home plan in the resident's language.
6. Gaps, where no local offer fits, are logged for the neighbourhood view.

**Responsible design.**
- A person leads every conversation. The tool never decides eligibility, benefits, housing or safety.
- Nothing is shared with a service until the resident agrees, and the status controls stay locked until then.
- Minimal data: identifiers are stripped before processing, and only anonymised categories feed the insights.
- Accuracy: every recommendation links to a directory record, low-confidence plans are flagged, and translations
  are shown next to the English so the connector can check them.
- Hardest to reach: the resident never needs a device. The plan prints in large type in their language.
- Bias: `eval_bias.py` checks that the same situation, written in plain English, broken English, Polish or
  romanised Urdu, gets routed to the same services.

**Known limits.** The safety keyword check is English only (the AI is also asked to flag risk in any language).
Translations can be wrong. The directory here is sample data.

**Path to adoption.** Pilot in one Live Well Centre for six weeks with real connectors and a verified directory.
Measure handovers completed, time per conversation, and how often residents had to repeat themselves. Then share
through GMCA with the other nine boroughs, which use the same Live Well model.

Model in use: `{config.MODEL}`.
"""
    )


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

def main() -> None:
    init_state()
    pages = ["Conversation", "Handovers", "Neighbourhood insights", "About"]
    st.session_state.setdefault("page", pages[0])

    st.sidebar.title("Tell It Once")
    st.sidebar.caption(f"{config.BOROUGH} Live Well: tell your story once, get the right help.")
    page = st.sidebar.radio("View", pages, key="page")
    large = st.sidebar.toggle("Larger text", key="large_text")
    with st.sidebar.expander("Demo controls"):
        st.caption(f"Model: {config.MODEL}")
        if st.button("Clear all demo cases"):
            get_store().clear()
            st.session_state.current_case_id = None
            st.rerun()

    if large:
        st.markdown(
            "<style>p, li, label, textarea, .stMarkdown, .stButton button {font-size: 1.2rem !important;}</style>",
            unsafe_allow_html=True,
        )

    {
        "Conversation": page_conversation,
        "Handovers": page_handovers,
        "Neighbourhood insights": page_insights,
        "About": page_about,
    }[page]()


main()
