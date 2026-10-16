# Tell It Once

An AI copilot for the community connectors and volunteers who staff Greater Manchester's Live Well Centres and Spaces.

A connector sits with a resident and writes their story down once, in any language. Tell It Once turns it into linked needs, matches them to local council and community offers, drafts a warm handover (a message and a 30-second phone script) for each, and produces a take-home plan in the resident's own language. A person leads every conversation, and nothing is shared with a service until the resident agrees.

Built for the Green Circles Manchester "Build for Greater Manchester" hackathon, October 2026.

## Run it

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then paste your Anthropic API key and set BOROUGH
streamlit run app.py
```

The app opens in your browser. Expand "Demo residents", pick one, and press "Build the plan".

Run the offline tests with `pip install pytest && pytest`. They need no API key.

## Before the demo

1. **Set the borough.** Change `BOROUGH` in `.env`. It flows through the app, the prompts and the directory.
2. **Swap in real services.** Edit `data/services.json`. Ten to fifteen real services from the council website beat twenty sample ones. Keep the same fields, and keep `id` short and unique. `{borough}` in any field is replaced automatically.
3. **Rewrite the personas** in `data/personas.json` around the problem the council rep cares about most.
4. **Warm the cache.** Click every demo resident once while online. Responses are saved to `data/response_cache.json`, so the demo still works if the venue wifi drops.
5. **Run the bias check** with `python eval_bias.py`. It writes `data/bias_report.md`, a table you can put on the responsible-design slide.
6. **Clear demo cases** from the sidebar ("Demo controls") so the judges see a clean queue.

If responses feel slow, set `ANTHROPIC_MODEL=claude-haiku-5-5` in `.env`.

## What is in here

| File | What it does |
| --- | --- |
| `app.py` | The young people's app: routes between the pages in `flow/` |
| `flow/` | One module per page: path, opportunity type, questions, results |
| `matcher.py` | Matches answers to `data/opportunities.json`, with a no-AI fallback |
| `connector_app.py` | The earlier connector-facing app: Conversation, Handovers, Neighbourhood insights and About views |
| `triage.py` | Prompt, structured tool call, validation against the directory, offline cache |
| `safety.py` | PII redaction and fixed crisis rules, both run before the AI sees anything |
| `directory.py` | Loads the service directory and formats it for the prompt |
| `plan_export.py` | The printable, large-type take-home plan |
| `store.py` | A small JSON case store |
| `eval_bias.py` | Checks that the same situation is routed the same way in four writing styles and languages |
| `data/` | Sample directory and synthetic personas |

## How it stays safe

- Phone numbers, emails, postcodes, NI numbers and long account numbers are stripped before anything leaves the laptop.
- Fixed, human-written safety information appears for risk to life, danger, homelessness tonight or no food. It does not depend on the AI, and it still shows if the AI service is down.
- The model can only recommend services in the directory. Anything else it suggests is removed and the plan is flagged as low confidence.
- The model never decides eligibility. The connector checks every plan, and handover tracking stays locked until the resident consents.
- Translations are shown next to the English so the connector can check them.

**Known limits.** The safety keyword rules are English only, though the model is also asked to flag risk in any language. Machine translation can be wrong. The bundled directory is sample data and every contact detail must be verified before real use.

## Optional: voice notes

`pip install faster-whisper` and restart. A voice-note recorder appears under the notes box and transcripts are appended to the notes. The first run downloads the speech model, so do it before the demo.
