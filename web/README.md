# Pathly web front end

Plain HTML, CSS and JS with GSAP 3.15.0 ([standard licence](https://gsap.com/standard-license/)) and Lenis 1.1.13 (MIT), both vendored in `vendor/`. The hero's dot field is ported from [React Bits](https://reactbits.dev) (MIT + Commons Clause). No build step.

Run from the repo root: `uvicorn api:app --reload`, then open http://127.0.0.1:8000. FastAPI serves this folder at `/` and the API under `/api` (contract in the main README). Without an API key the results use a simple no-AI match, so the page always works.

| File | What it holds |
| --- | --- |
| `index.html` | Hero with the chat window, what is out there, the map, what happens to your answers |
| `styles.css` | Tokens at the top. Three colours only: `--paper`, `--ink` and `--orange` (with `--orange-ink` for small orange text). Type carries the variety: Bricolage Grotesque headlines, Instrument Serif italic accents, IBM Plex Mono labels, Atkinson Hyperlegible body, the same families as `/map` |
| `app.js` | Flow logic, results rendering, the map hook, voice chat and all motion (GSAP, Lenis smooth scroll). Motion is skipped when the visitor asks for reduced motion |
| `dotfield.js` | The hero background: the React Bits DotField component ported to plain JS (WebGL2; falls back to a CSS dot grid) |

## Voice chat (ElevenLabs Agents)

The mic at the top of the hero opens a voice conversation with an ElevenLabs agent, and both sides appear as chat bubbles. The agent asks the same questions as the form, then calls the `find_opportunities` client tool, which runs the normal `/api/match` (redaction, crisis check, verified opportunities only) and shows the result cards on the page. The browser never sees the API key: `GET /api/voice/session` returns a 15-minute signed URL. Without the two keys the mic says voice is not set up and the form still works.

Quickest setup: put `ELEVENLABS_API_KEY` in the repo-root `.env` (a key with Text to Speech, Speech to Text and Agents write access), then run `python scripts/setup_voice_agent.py`. It creates the agent below with its `find_opportunities` tool and authentication on, and writes `ELEVENLABS_AGENT_ID` to `.env`. Restart uvicorn.

Or set it up by hand, once, in the ElevenLabs dashboard (Agents):

1. Create an agent. Under Security, turn on authentication (so only signed URLs can start a call).
2. First message: `Hi, I'm Pathly. I help young people in Oldham find volunteering, jobs and things to get involved in. Are you studying at the moment, or exploring your options?`
3. System prompt:

   ```text
   You are Pathly, a friendly voice guide for young people in Oldham. Keep every reply to one or two short sentences and ask one question at a time.
   Sound like a kind, patient youth worker: warm, gentle and encouraging, never salesy or over-excited. If they give a short or unclear answer, accept it and move on rather than asking the same question again.
   Find out, in this order:
   1. path: "student" if they are studying, otherwise "explore".
   2. type: "voluntary", "paid_work" or "social_work" (social means clubs, groups and activities).
   3. If student: hobbies, then what they study. If exploring: interests, then any past work or experience.
   4. district: Central, East, North, South or West Oldham, or "Anywhere in Oldham".
   Then call find_opportunities with what you heard. Read out the matches briefly, with each first step, and say the full details are on screen.
   If the tool returns a crisis message, say it first, calmly, before anything else.
   Never ask for or repeat a name, address, phone number, school name or date of birth. If they share one, do not use it.
   Only mention opportunities the tool returned. Never promise a place, a job or eligibility; say they can contact the provider to check.
   ```

4. Add a client tool named `find_opportunities`, with "Wait for response" on, description `Find real Oldham opportunities that match what the young person said.`, and these string parameters: `path` (required, `student` or `explore`), `type` (required, `voluntary`, `paid_work` or `social_work`), `district` (optional, one of the district names above), `hobbies`, `studies`, `interests`, `experience` (all optional).
5. Put the keys in the repo-root `.env`: `ELEVENLABS_API_KEY` (an API key with Agents access) and `ELEVENLABS_AGENT_ID` (from the agent page). Restart uvicorn.

The SDK is loaded from jsDelivr (`@elevenlabs/client@1.26.0`) only when someone taps the mic. Voice audio goes to ElevenLabs, which the note under the mic tells the visitor.

## Map

`map.js` draws Akshita's Oldham map data (`frontend/data/oldham-map.js`, served at `/map/data/`) inside `<div id="oldham-map">`, in this site's colours with no tile server. Dots are council directory places for the chosen type and area, inside the borough only; matches appear as numbered pins, and result cards get a "See it on the map" button. The map follows the chat as it goes (type, area, then numbered matches, with pins lit up when the chat talks about them) and resets on Start again. The full map app is at `/map/`; the chat saves its answers and matches in `sessionStorage` (`pathly:chat`, gone when the tab closes), so `/map/` opens straight on the same results, or on the right question if the chat isn't finished. If Leaflet or the data fails to load, the plain district buttons stay.

## Voice and chat

The hero is a chat. Pathly asks the wireframe questions one at a time (studying or exploring, type, hobbies or interests, studies or experience, area), each with a pop-up of numbered options above the prompt bar, like Claude's question cards: click, press the number, or use the arrow keys and Enter; Esc or "Something else" means type your own. Typed answers are read in plain words ("college", "I want money", "Royton"), and free-text questions take "skip". The questions live in `QUESTIONS` in `app.js`. Matches from `POST /api/match` then appear in the chat as cards, and the conversation carries on through `POST /api/chat`, with its suggested questions shown as the pop-up.

The paperclip in the bar (and "Upload my CV" in the experience question) uploads a PDF, Word or .txt file to `POST /api/read-doc`. The cleaned text is added to the `experience` answer, so the CV can stand in for that question; uploaded after the results, it runs the match again. The chat shows "Uploaded a PDF file", not the file name, since CV file names usually carry the person's name.

The mic beside the bar starts a spoken conversation with the ElevenLabs agent when one is set up (below). Otherwise it dictates into the bar: through the server (`/api/transcribe`, which removes personal details) when there is an ElevenLabs key, or the browser's own speech recognition when there is not. With a key, Pathly's messages and the result cards also get a Listen button.

## Map contract

The contract `map.js` follows, for any replacement map:

- When someone picks an area, call `window.Pathly.setDistrict(name)` with one of `Central`, `East`, `North`, `South`, `West` or `Anywhere in Oldham`. It updates the form, the "Showing:" label and the answers sent to the matcher.
- To react to picks made elsewhere (the form's dropdown), listen for `document.addEventListener('pathly:district', (e) => e.detail.district)`.
- `window.Pathly.answers` holds what the young person has chosen so far (for example `answers.type`), if the map wants to highlight matching places.
- Each opportunity in `data/opportunities.json` has an `area` field with the same district names, so map pins can use it.

The full map lives at `/map` (`frontend/`, served by the API). To match this page, use the same three colours: land and background `--paper`, roads and boundaries `--line`, districts in a light tint of `--orange` with the selected one solid `--orange` and an `--ink` outline, pins in `--ink` with the matched ones in `--orange`. Type: Bricolage Grotesque, Instrument Serif italic for the odd accent, IBM Plex Mono for small labels.

Keep the map usable without a mouse (buttons or keyboard selection) and never ask for a full postcode or address.
