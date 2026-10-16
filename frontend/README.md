# Pathly front end: Oldham map

The young people's flow from the team wireframe (Student or Exploring, then Voluntary, Paid work or Social work, then a few questions) with results on an interactive map of Oldham.

## Run it

Open `index.html` in a browser, or serve the folder so it can call the Pathly API:

```bash
python3 -m http.server 5173 --directory frontend
```

Then visit http://localhost:5173. Port 5173 is already in the API's default `ALLOWED_ORIGINS`.

## Change the look

- **Colours and fonts:** `theme.css`. Every colour is a token at the top; keep the two dark blocks in step with each other.
- **Layout and components:** `styles.css`.
- **Wording and questions:** `app.js` (search for `T = ()`, `WANT`, `ENJOY`, `STUDY`, `EXP`).

## How matching works

1. If `config.js` has an `apiUrl` and the API answers, results come from `POST /api/match` (redaction, crisis rules and the team's matcher).
2. Otherwise `app.js` matches against the map listings itself. When it runs as a Claude artifact it asks Claude to pick from the listings; in a normal browser it uses keywords. The crisis rules and PII patterns from `safety.py` are applied first (`data/safety-rules.js`, regenerate with `python scripts/oldham_map/export_safety_rules.py`).

## Data

`data/oldham-map.js` is generated: 453 places from Oldham Council's service directory (it has a public JSON feed at `services.oldham.gov.uk/wp-json/wp/v2/`), Give Food and OpenStreetMap, plus the borough outline, roads, Metrolink, rail, water and parks. All fetched on 16 Oct 2026. The scripts that made it are in `scripts/oldham_map/`.

Credit on the map: OpenStreetMap contributors (ODbL), Oldham Council, Give Food.

## One file to share

```bash
python frontend/build_single_file.py
```

Writes `frontend/dist/pathly.html` with everything inlined except the map library and fonts.
