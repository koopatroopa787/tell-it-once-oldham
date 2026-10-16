"""Builds the printable "My plan" handout a resident takes home."""

from __future__ import annotations

import html
from datetime import date

from directory import Directory


def render_plan_html(case: dict, directory: Directory, borough: str) -> str:
    """Return a self-contained, print-friendly HTML page in large type."""
    plan = case["plan"]
    rtl = case.get("language") in {"Urdu", "Arabic", "Farsi", "Pashto", "Kurdish (Sorani)"}
    direction = "rtl" if rtl else "ltr"

    rows = []
    for number, handover in enumerate(plan["handovers"], start=1):
        svc = directory.get(handover["service_id"])
        if svc is None:
            continue
        rows.append(
            f"""
            <section class="step">
              <h2>{number}. {html.escape(svc['name'])}</h2>
              <p><strong>Contact:</strong> {html.escape(svc.get('contact', ''))}</p>
              <p><strong>How to get it:</strong> {html.escape(svc['how_to_access'])}</p>
              <p><strong>Bring:</strong> {html.escape(handover['what_to_bring'])}</p>
              <p class="tick">[ ] Done</p>
            </section>"""
        )

    resident_plan = html.escape(plan["plan_for_resident"]).replace("\n", "<br>")
    english_plan = html.escape(plan["plan_for_resident_english"]).replace("\n", "<br>")
    english_block = ""
    if case.get("language", "English") != "English":
        english_block = f'<section class="english" dir="ltr"><h2>In English</h2><p>{english_plan}</p></section>'

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My plan</title>
<style>
  body {{ font-family: Arial, Helvetica, sans-serif; font-size: 20px; line-height: 1.5; color: #111; background: #fff; max-width: 760px; margin: 24px auto; padding: 0 16px; }}
  h1 {{ font-size: 32px; margin-bottom: 4px; }}
  h2 {{ font-size: 24px; margin: 0 0 8px; }}
  .meta {{ color: #444; margin-top: 0; }}
  .summary, .step, .english {{ border: 2px solid #222; border-radius: 8px; padding: 16px; margin: 16px 0; }}
  .tick {{ font-size: 22px; }}
  footer {{ font-size: 16px; color: #333; margin-top: 24px; }}
  @media print {{ body {{ margin: 0; }} .step {{ break-inside: avoid; }} }}
</style>
</head>
<body>
<h1>My plan</h1>
<p class="meta">{html.escape(borough)} Live Well, {date.today().strftime('%d %B %Y')}</p>
<section class="summary" dir="{direction}"><p>{resident_plan}</p></section>
{''.join(rows)}
{english_block}
<footer>You can come back to the Live Well Centre at any time. You do not need to tell your story again: the people above have been told, with your permission.</footer>
</body>
</html>"""
