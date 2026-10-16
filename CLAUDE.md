# Pathly (Oldham): project guide and build plan

This file is read by Claude Code at the start of every session. It explains what we are building, the rules, and the ordered plan for the rest of the hackathon.

## What we are building

Tell It Once is an AI copilot for Oldham's front-line workers: Live Well connectors, youth workers and Get Oldham Working advisers. One conversation becomes a whole-household plan:

1. The worker photographs the resident's letters and types a few notes, in any language.
2. Personal details are removed and a fixed safety check runs before any AI is involved.
3. The model builds one story the family never has to repeat, with linked needs ranked by urgency.
4. **Money check:** support the household may be missing (council tax support, free school meals, Healthy Start, childcare help, discretionary housing payment), each flagged "check with welfare rights", never decided.
5. **Route to work:** for anyone in the household who wants work, including young people who are NEET, three concrete steps tied to jobs Oldham is hiring for, with live vacancies.
6. Warm handovers (message plus phone script) to verified Oldham services, a printed plan in the resident's language, and anonymised insight for the council.

Hackathon: Green Circles Manchester, "Build for Greater Manchester". Our borough is Oldham. Judging: problem understanding 25%, impact 25%, feasibility and adoption 20%, use of AI 15%, responsible design 15%.

## Current direction: Pathly, the young people's flow (from the team wireframe)

Product name: **Pathly**. This supersedes the phases below where they conflict; "Tell It Once" now refers only to the earlier connector tool. The app is now aimed at young people using it themselves.

Pathly is a live website: a React front end (design not decided yet, so no UI code for now) calling a Python HTTP API. Streamlit has been removed. Run the API with `uvicorn api:app --reload`; docs at http://localhost:8000/docs.

Flow: Page 1 Student or Exploring for options -> Page 2 Voluntary, Paid work or Social work -> Page 3 (student: hobbies and current studies; exploring: interests and past work or experience, plus district) -> Results (AI matches with link, phone and contact).

API: `GET /api/questions` returns the paths, types and per-path questions from `questions.py`, so the site never hard-codes them. `POST /api/match` takes the answers and returns `crisis`, `matches` (with contact details) and `used_ai`.

One owner per file so merges do not conflict:

| Slot | Files |
| --- | --- |
| Questions and wording | `questions.py` |
| HTTP API | `api.py`, `tests/test_api.py` |
| AI matching | `matcher.py` |
| Real Oldham opportunities | `data/opportunities.json` (keep the fields; leave blank rather than guess) |
| Website (once the design is agreed) | `frontend/` |

Conventions: a new question = one entry in `QUESTIONS` in `questions.py` and one optional field on `MatchRequest` in `api.py`. `matcher.py` redacts PII, forces a tool call, drops ids not in the list, and falls back to a no-AI match, so the app runs without an API key. Open question: does "Social work" mean social care careers or community and social activities? The sample data has both.

## Non-negotiable rules

- Never use real resident data. Personas and letter images are synthetic and marked SAMPLE.
- Never commit `.env` or any API key. The repo is public.
- Redaction (`safety.py`) and crisis rules stay deterministic and run before the model. Do not move them into the prompt.
- The model may only recommend services in the verified directory and facts in the retrieved knowledge. Anything else is dropped and the plan is flagged low confidence. Keep this validation in `triage.py`.
- The tool never decides eligibility. Wording is always "may be able to get" plus who decides.
- Letter images are sent to the model and then discarded. They are never written to disk or stored in a case.
- Professional code: type hints, docstrings, no emojis in code, UI text or docs. UI copy is plain English and sounds human.
- Keep `pytest` passing. Run it before every push.

## Current state (already working)

- `api.py`: Pathly's HTTP API (health, questions, match). `questions.py`, `matcher.py`.
- Tell It Once back end only (its Streamlit UI was removed; the phases below that mention `st.` or `app.py` predate this and need a web equivalent):
- `triage.py`: system prompt, forced tool call `record_plan`, validation against the directory, offline response cache.
- `safety.py`: PII redaction and crisis rules. `directory.py`, `store.py`, `plan_export.py` (printable plan).
- `eval_bias.py`: routes one situation written four ways and compares results.
- `data/services.json` is SAMPLE data and must be replaced with real Oldham services (Phase 4).

Run: `pip install -r requirements.txt`, copy `.env.example` to `.env`, then `uvicorn api:app --reload`. Tests: `pytest`.

## Team workflow

- One public repo, `main` is always demo-able.
- Each workstream works on its own branch and owns its own files, so merges do not conflict:
  - **Builder** (`feat/household-plan`): `triage.py`, `app.py`, `plan_export.py`, `data/personas.json`.
  - **Data** (`feat/knowledge-pack`): `scripts/build_kb.py`, `kb.py`, `data/kb/`, `data/services.json`.
  - **Live and pitch** (`feat/live-data`): `live/`, then the slides.
- Small commits, `git pull --rebase` before pushing, open a PR into `main` when a phase works. The Builder merges and integrates.

## Plan

Times assume we start at 11:15 and freeze code at 12:15. Each phase lists what "done" means. If a phase overruns, use the cut line.

### Phase 0: shared repo (11:15 to 11:25, Kanishk)

```bash
cd tell-it-once
git init -b main
git add . && git commit -m "Initial Tell It Once prototype"
gh repo create koopatroopa787/tell-it-once-oldham --public --source=. --remote=origin --push
# Give teammates push access (they must accept the email invite):
gh api -X PUT repos/koopatroopa787/tell-it-once-oldham/collaborators/<their-github-username> -f permission=push
```

Teammates then run `git clone https://github.com/koopatroopa787/tell-it-once-oldham.git`, create their own `.env`, and check out their branch.

Done when: everyone can clone, run the app and push to their branch.

### Phase 1: switch to Oldham (11:25 to 11:35, Builder)

- `BOROUGH` already defaults to Oldham in `config.py` and `.env.example`; check the UI text reads naturally.
- Add a "District" selectbox (Oldham's five districts; confirm the names on oldham.gov.uk) stored on each case and shown in the insights view.
- Add Urdu and Bengali near the top of the language list.
- Replace personas with Oldham ones, all synthetic:
  1. **The family (headline demo):** mum working part-time on low pay, council tax reminder letter and arrears, two younger children, eldest son 17 left college and is NEET. Language: English.
  2. A Bengali-speaking dad off work with a back injury, Universal Credit payment cut, wants work without heavy lifting.
  3. A 19-year-old with nowhere to sleep tonight (keeps the safety demo).

Done when: the app says Oldham everywhere and the family persona runs.

### Phase 2: household plan schema (11:35 to 12:00, Builder)

Extend `TRIAGE_TOOL` in `triage.py`, the validation in `_validate`, the UI and `plan_export.py`:

- `money_check`: list of `{support, why_it_may_apply, check_with_service_id, source_id}`. `check_with_service_id` must be in the directory; `source_id` must be a retrieved knowledge chunk (Phase 4) or empty.
- `route_to_work`: list per person of `{person, goal, target_roles[], steps[3]}`, each step `{action, service_id_or_course, when}`.
- `letters`: list of `{sender, letter_type, key_date, amount, action_needed, urgency}` (filled in Phase 3).
- New UI sections on the Conversation page: "Money check", "Route to work" (one card per person), "Letters". Add both to the printable plan.
- Update `tests/test_core.py`: unknown service ids inside `money_check` and `route_to_work` are dropped.

Done when: the family persona produces a money check for mum and a three-step route for the son.

### Phase 3: letter scanning (12:00 to 12:10, Builder)

- Add `st.file_uploader("Photos of letters", type=["png","jpg","jpeg"], accept_multiple_files=True)` and an optional `st.camera_input`.
- Send images as base64 image content blocks in the same `messages.create` call, before the notes text. Resize to a maximum of 1568 px on the long edge with Pillow to keep calls fast.
- Prompt addition: extract the letter fields; never transcribe names, addresses, account or reference numbers; flag court dates, summonses and sanctions as urgent.
- Run `redact_pii` over every extracted string before it is stored.
- The cache key must include a hash of the image bytes.
- Create two synthetic letter images with Pillow in `scripts/make_sample_letters.py`: a council tax reminder and a Universal Credit sanction notice, both watermarked SAMPLE, with fake names. Save them to `data/sample_letters/`.

Done when: uploading the sample council tax letter adds an urgent "Letters" card with the date and amount.

Cut line: if behind at 12:05, skip the camera input and keep the uploader only.

### Phase 4: permanent knowledge pack (11:25 to 12:05, Data)

1. **Real directory first.** Go through services.oldham.gov.uk (Financial Support, Health and social care, Activities and groups) and Oldham Council pages. Write 15 to 20 real services into `data/services.json` with the existing fields, including Get Oldham Working, welfare rights, council tax support, housing options, the youth service, Action Together, food support and talking therapies. Verify contact details by hand; leave a field blank rather than guess.
2. **Knowledge chunks.** `scripts/build_kb.py` fetches a fixed URL list, cleans it to text, splits it into chunks of about 800 characters, and writes `data/kb/chunks.jsonl` with `{id, title, url, fetched_at, text}`. Commit the output so the app works offline. Start the list with:
   - GOV.UK Content API pages, for example `https://www.gov.uk/api/content/apply-free-school-meals`, `.../healthy-start`, `.../council-tax-reduction` (check each path resolves), plus the Universal Credit and childcare pages.
   - Oldham Council pages for council tax support, free school meals and discretionary housing payment.
   - Oldham's Live Well update (March 2026) and the Get Britain Working trailblazer report.
3. **Retriever.** `kb.py` builds a TF-IDF index with scikit-learn at startup (`@st.cache_resource`) and exposes `search(query: str, k: int = 6) -> list[dict]`. Add `scikit-learn` to `requirements.txt`.
4. **Wire-in (with Builder).** `triage.py` searches with the redacted notes and passes the top chunks into the system prompt as `KNOWLEDGE` with their ids. The UI lists the cited chunks under "Sources" as links.

Done when: the money check cites a GOV.UK or Oldham page for each flag, and `pytest` covers `kb.search` returning results for "free school meals".

Cut line: if behind at 12:00, ship the real directory and GOV.UK chunks only, without the Oldham reports.

### Phase 5: live data (11:25 to 12:05, Live and pitch)

Create a `live/` package. Every function returns `{"source": ..., "fetched_at": ..., "items": [...]}`, caches results for 30 minutes, and returns an empty list with a reason instead of raising.

1. **Vacancies (primary).** `live/jobs.py` with `search_jobs(role: str, where: str = "Oldham", distance_km: int = 10, limit: int = 5)` using the Adzuna API:
   `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=...&app_key=...&what=<role>&where=Oldham&distance=10&results_per_page=5`
   Keys come from `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in `.env`. Return title, employer, location, salary range if present, posted date and link.
2. **Food banks (backup, no signup).** `live/foodbanks.py` with `nearest_foodbanks(area: str)` using the Give Food API v2 search endpoint (check the exact query parameter in https://www.givefood.org.uk/api/2/docs/). Return name, distance, current needs and the food bank's link, and show "Data from Give Food" with a link, as their terms ask.
3. **Wire-in (with Builder).** After triage, for each `target_roles` entry call `search_jobs` and show up to three vacancies on that person's Route to work card, with "Live from Adzuna, fetched HH:MM". If a food need is present, show the nearest food banks.
4. Only the postcode district (for example OL8) ever goes to a live API, never a full postcode or address.

Done when: the son's Route to work card shows real current vacancies in Oldham.

Cut line: if the Adzuna key has not arrived by 11:50, ship Give Food only and mention vacancies as the next step in the pitch.

### Phase 6: freeze and rehearse (12:05 to 12:45, everyone)

- 12:05: merge all branches into `main`, run `pytest`, run every persona once online to warm `data/response_cache.json`.
- 12:10: `python eval_bias.py` and put the table on the responsible-design slide.
- 12:15: code freeze. Clear demo cases from the sidebar.
- 12:15 to 12:45: rehearse the three-minute demo twice. Script: the family walks in, letters scanned, money check for mum, route to work with live jobs for the son, safety demo with the 19-year-old, insights view, adoption path, pitch line.

Pitch line: "In Oldham, poverty is a household problem. Tell It Once gets the money sorted today and a route into work for everyone who wants one, in a single conversation."
