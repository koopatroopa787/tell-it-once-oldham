# Pathly web front end

Plain HTML, CSS and JS with GSAP (vendored in `vendor/`, version 3.15.0, [GSAP standard licence](https://gsap.com/standard-license/)). No build step.

Run from the repo root: `uvicorn api:app --reload`, then open http://127.0.0.1:8000. FastAPI serves this folder at `/` and the API under `/api` (contract in the main README). Without an API key the results use a simple no-AI match, so the page always works.

| File | What it holds |
| --- | --- |
| `index.html` | Hero, the flow (path, type, about, results), paths, map slot, how it works |
| `styles.css` | Colour tokens at the top: shades of orange plus one complement (petrol blue). Accent classes `c-orange`, `c-peach`, `c-sand`, `c-blue`, `c-sky` set `--c` (colour) and `--on` (readable text on it). Category colours: voluntary peach, paid work blue, social sand |
| `app.js` | Flow logic, results rendering, the map hook and all motion. Motion is skipped when the visitor asks for reduced motion |

## Map

`map.js` draws Akshita's Oldham map data (`frontend/data/oldham-map.js`, served at `/explore/data/`) inside `<div id="oldham-map">`, in this site's colours with no tile server. Dots are council directory places for the chosen type and area, inside the borough only; matches appear as numbered pins, and result cards get a "See it on the map" button. The full map app is at `/explore/`. If Leaflet or the data fails to load, the plain district buttons stay.

## Voice and chat

When the server has an ElevenLabs key, questions, results, crisis messages and chat replies get a Listen button, and each answer box gets a Speak button (recorded in the browser, transcribed on the server). Ask Pathly under the results calls `POST /api/chat`.

## Map contract

The contract `map.js` follows, for any replacement map:

- When someone picks an area, call `window.Pathly.setDistrict(name)` with one of `Central`, `East`, `North`, `South`, `West` or `Anywhere in Oldham`. It updates the form, the "Showing:" label and the answers sent to the matcher.
- To react to picks made elsewhere (the form's dropdown), listen for `document.addEventListener('pathly:district', (e) => e.detail.district)`.
- `window.Pathly.answers` holds what the young person has chosen so far (for example `answers.type`), if the map wants to highlight matching places.
- Each opportunity in `data/opportunities.json` has an `area` field with the same district names, so map pins can use it.

Theme the map with the CSS tokens rather than its default colours, so it matches the page (we will restyle it to match once it lands): land and background `--paper` or `--cream`, roads and boundaries `--line`, district fill `--sand`, hover `--peach`, selected district `--orange` with an `--ink` outline, opportunity pins coloured by category (`--peach`, `--blue`, `--sand`) with an `--ink` stroke. Labels in `Anton` (display) or `Kode Mono` (small). With Leaflet or MapLibre, a muted base map (for example CARTO Positron) plus these colours on the GeoJSON layer works well.

Keep the map usable without a mouse (buttons or keyboard selection) and never ask for a full postcode or address.
