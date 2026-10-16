/*
  Pathly front-end settings.

  apiUrl: where the Pathly API runs (uvicorn api:app). When it is set and reachable, results
  come from POST /api/match, which removes personal details, runs the crisis rules and
  matches with the team's model. Leave it empty to use the matching built into app.js.
*/
window.PATHLY_CONFIG = {
  apiUrl: "http://localhost:8000",
};
