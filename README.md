# Pathly

Pathly helps young people in Oldham find their next step: volunteering, paid work or social opportunities. They answer a few questions about themselves, and AI matches them to verified local opportunities, each with a link and contact details.

Pathly will be a live website with a React front end (design still to be decided). The Python side is an HTTP API in `api.py` that the site calls.

### Run the API

```bash
pip install -r requirements.txt
cp .env.example .env                 # then paste your DeepSeek and ElevenLabs keys
uvicorn api:app --reload
```

The demo website in `web/` is served at http://localhost:8000/ (see `web/README.md`). Interactive docs are at http://localhost:8000/docs. Matching and the "Ask Pathly" chat use DeepSeek (`DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` in `.env`). Voice uses ElevenLabs (`ELEVENLABS_API_KEY`). Without keys it still answers, using a simple match instead of the AI, and the site is text only. Set `ALLOWED_ORIGINS` in `.env` to the website's address once it is deployed; the default allows the local React dev servers on ports 5173 and 3000.

| Endpoint | What it does |
| --- | --- |
| `GET /api/health` | Returns `{"status": "ok"}` |
| `GET /api/questions` | The two paths, three opportunity types, the questions for each path and the district list, so the site never hard-codes them |
| `POST /api/match` | Takes `path`, `type`, `district` and the free-text answers; returns `crisis` (fixed safety information or `null`), `summary`, `possible_directions`, `matches` (name, provider, area, why it fits, first step, barrier tip, phone, contact, link), `follow_up_questions`, `confidence` and `used_ai` |
| `POST /api/chat` | Ask Pathly: `{answers, matched_opportunity_ids, history, message}`; answers only about the matches shown, with crisis messages bypassing the AI. 30 questions per visitor per 10 minutes |
| `GET /api/voice` | `{"enabled": true}` when an ElevenLabs key is set, so the site shows the Listen and Speak buttons |
| `POST /api/speak` | `{text}` (up to 800 characters) to MP3 audio through ElevenLabs |
| `POST /api/transcribe` | Raw audio in the body (for example `audio/webm` from the browser) to `{text, removed}`, with personal details removed. Voice calls are limited per visitor to protect credits |

Unknown fields, unknown districts and answers over 1,000 characters are rejected with a 422.

### API contract (for the website and the chatbot)

The chatbot can gather the answers in conversation, in any language it supports. It then calls `POST /api/match` with these fields, so matching keeps its guarantees wherever the chat runs: personal details are removed, only verified Oldham opportunities are returned, and crisis information comes first.

Request:

```json
{
  "path": "student | explore",
  "type": "voluntary | paid_work | social_work",
  "district": "Anywhere in Oldham | Central | East | North | South | West",
  "hobbies": "student path only",
  "studies": "student path only",
  "interests": "explore path only",
  "experience": "explore path only"
}
```

Only `path` and `type` are required. The text fields are optional and limited to 1,000 characters each.

Response (a real reply, cut to one match):

```json
{
  "crisis": null,
  "matches": [
    {
      "id": "social-mahdlo",
      "name": "Mahdlo Youth Zone",
      "provider": "Mahdlo",
      "area": "Central",
      "why": "Sport, arts, music, climbing and cooking, open seven days a week. Membership is 5 pounds a year, then 50p a visit.",
      "first_step": "Join online or at reception. Egerton Street, OL1 3SE, opposite Blue Coat School (buses 76, 403, 411, 893).",
      "phone": "0161 624 0111",
      "contact": "info@mahdloyz.org",
      "link": "https://www.mahdloyz.org"
    }
  ],
  "used_ai": false
}
```

- **`crisis`**: either `null` or `{"label", "message"}`. When it is set, show the message above the matches. It never depends on the AI.
- **`matches`**: usually 3 to 5 items. `phone`, `contact` and `link` can be empty strings, so hide them when empty.
- **`used_ai`**: `false` means the simple match was used. You can show a small note when it is `false`.

Run the offline tests with `pytest`. They need no API key.

## Before the demo

1. **Set the borough.** Change `BOROUGH` in `.env`. It flows through the API, the prompts and the opportunity list.
2. **Swap in real opportunities.** Edit `data/opportunities.json`. Keep the same fields, keep `id` short and unique, and leave a field blank rather than guess. `{borough}` in any field is replaced automatically.

Pathly uses `DEEPSEEK_MODEL=deepseek-flash`. Only the Tell It Once modules (`triage.py`, `eval_bias.py`) still use Anthropic.

## What is in here

| File | What it does |
| --- | --- |
| `api.py` | The HTTP API the website calls |
| `questions.py` | The paths, opportunity types, questions and districts the site shows |
| `matcher.py` | DeepSeek analysis and grounded follow-up chat, with a no-AI fallback |
| `deepseek_gateway.py` | Creates the server-side DeepSeek client; the browser never receives the key |
| `voice.py` | ElevenLabs text to speech and speech to text, called only from the server |
| `safety.py` | PII redaction and fixed crisis rules, both run before the AI sees anything |
| `directory.py` | Loads an opportunity or service list and formats it for the prompt |
| `data/` | 16 real Oldham opportunities (`opportunities.json`, checked 16 Oct 2026), plus the Tell It Once sample services and personas |

## How it stays safe

- Phone numbers, emails, postcodes, NI numbers and long account numbers are stripped before anything reaches the AI.
- Fixed, human-written safety information is returned for risk to life, danger, homelessness tonight or no food. It does not depend on the AI, and it still appears if the AI service is down.
- The model can only recommend opportunities in the list. Anything else it suggests is removed.
- The model never decides eligibility. Wording is always "you could" or "you may be able to".

**Known limits.** The safety keyword rules are English only. The opportunity list was gathered from each organisation's own page on 16 Oct 2026 (see each entry's `source`); re-check contact details and times before real use.

## Tell It Once (earlier connector tool, back end only)

The first prototype: an AI copilot for the community connectors who staff Greater Manchester's Live Well Centres. A connector writes a resident's story down once, and it becomes linked needs, matched services, warm handovers and a take-home plan in the resident's language. Built for the Green Circles Manchester "Build for Greater Manchester" hackathon, October 2026.

Its Streamlit interface has been removed. The logic is still here and is not used by Pathly's API:

| File | What it does |
| --- | --- |
| `triage.py` | Prompt, structured tool call, validation against the directory, offline cache |
| `plan_export.py` | The printable, large-type take-home plan |
| `store.py` | A small JSON case store |
| `eval_bias.py` | Checks that the same situation is routed the same way in four writing styles and languages |
