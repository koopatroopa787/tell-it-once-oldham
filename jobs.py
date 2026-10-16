"""Jobs on the open market near Oldham, shown after the matches.

Live listings come from the Adzuna API when ADZUNA_APP_ID and ADZUNA_APP_KEY are set (free at
developer.adzuna.com). Without them, or if Adzuna is down, the site still gets ready-made searches
on GOV.UK Find a job, Indeed and Reed. Only a keyword from the fixed list below is ever sent out, never
anything the young person typed.
"""

from __future__ import annotations

import os
import re
import time
from functools import lru_cache
from urllib.parse import quote_plus

import httpx

# What someone said they like -> a job search keyword. First match wins.
KEYWORDS = [
    (r"sport|fitness|football|\bgym|swim|danc", "leisure assistant"),
    (r"\bart\b|draw|design|paint|photo", "design"),
    (r"\bgam|tech|computer|\bcod|program|\bit\b", "IT support"),
    (r"music|event|festival|theatre|drama", "events"),
    (r"cook|bak|food|kitchen|chef", "kitchen"),
    (r"help|\bcar(e|ing)\b|\bnan\b|grand|famil|people|child|nurs", "care assistant"),
    (r"shop|retail|sales|customer", "retail"),
    (r"\bcars?\b|mechanic|engine|build|construct|electric|plumb", "trainee"),
]
ENTRY = "apprentice trainee junior entry weekend"  # Adzuna what_or: any of these words
TIMEOUT = 8


def keyword(*texts: str | None) -> str:
    text = " ".join(t for t in texts if t).lower()
    return next((kw for pattern, kw in KEYWORDS if re.search(pattern, text)), "apprentice")


def search_links(kw: str) -> list[dict[str, str]]:
    q = quote_plus(kw)
    return [
        {"site": "GOV.UK Find a job", "url": f"https://www.jobs.service.gov.uk/jobs/search?keywords={q}&location=Oldham"},
        {"site": "Indeed", "url": f"https://uk.indeed.com/jobs?q={q}&l=Oldham"},
        {"site": "Reed", "url": f"https://www.reed.co.uk/jobs/{kw.replace(' ', '-').lower()}-jobs-in-oldham"},
    ]


def _salary(job: dict) -> str:
    low, high = job.get("salary_min"), job.get("salary_max")
    if not low:
        return ""
    return f"£{low:,.0f}" if not high or high == low else f"£{low:,.0f} to £{high:,.0f}"


@lru_cache(maxsize=64)
def _adzuna(kw: str, _bucket: int) -> tuple[dict, ...]:
    # ponytail: 30-minute in-process cache keyed on (keyword, time bucket) to stay inside Adzuna's free quota
    response = httpx.get(
        "https://api.adzuna.com/v1/api/jobs/gb/search/1",
        params={
            "app_id": os.getenv("ADZUNA_APP_ID"), "app_key": os.getenv("ADZUNA_APP_KEY"),
            "where": "Oldham", "distance": 10, "what_or": ENTRY, **({"what": kw} if kw else {}),
            "max_days_old": 30, "sort_by": "date", "results_per_page": 5,
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return tuple(
        {
            "title": j.get("title", ""), "company": (j.get("company") or {}).get("display_name", ""),
            "area": (j.get("location") or {}).get("display_name", ""), "salary": _salary(j),
            "posted": (j.get("created") or "")[:10], "url": j.get("redirect_url", ""),
        }
        for j in response.json().get("results", [])
        if j.get("redirect_url", "").startswith("https://")
    )


def find(interest: str | None, experience: str | None) -> dict:
    kw = keyword(interest, experience)
    jobs: list[dict] = []
    if os.getenv("ADZUNA_APP_ID") and os.getenv("ADZUNA_APP_KEY"):
        try:
            bucket = int(time.time() // 1800)
            jobs = list(_adzuna(kw, bucket) or _adzuna("", bucket))  # nothing for the keyword: any entry-level job
        except (httpx.HTTPError, ValueError):
            jobs = []
    return {"keyword": kw, "live": bool(jobs), "jobs": jobs, "search_links": search_links(kw)}
