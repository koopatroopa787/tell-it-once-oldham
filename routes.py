"""Which mainstream services someone can use, from their age, situation and Universal Credit status.

Pathly is the front door, not the service: these fixed rules (no AI) point people to the national and
Oldham services that already exist, including ones people often think they can't use, such as careers
advice when you are already in a job. Every rule cites the page it came from (checked 16 Oct 2026).
The wording is always "you can" or "you may be able to": the service itself decides eligibility.
"""

from __future__ import annotations

from typing import Callable

AGES = ("under_18", "18", "19_21", "22_24", "25_plus")
SITUATIONS = ("not_working", "underemployed", "graduate", "student")
UC = ("yes", "no", "not_sure")

NOW, LATER, CHECK = "now", "later", "check"

YOUTH_GUARANTEE = "https://www.gov.uk/guidance/help-to-find-work-for-universal-credit-claimants-aged-16-to-24"


def _route(name: str, provider: str, how: str, *, phone: str = "", link: str, source: str) -> dict:
    return {"name": name, "provider": provider, "how": how, "phone": phone, "link": link, "source": source}


CAREERS = _route(
    "Free careers adviser", "DWP Jobs and Careers Service",
    "Call 0800 072 0288, Monday to Friday 8am to 6pm, free from most phones.",
    phone="0800 072 0288", link="https://nationalcareers.service.gov.uk/help-and-support",
    source="https://nationalcareers.service.gov.uk/help-and-support")
YOUTH_HUB = _route(
    "Oldham Youth Hub", "Get Oldham Working, Positive Steps and Jobcentre Plus",
    "Drop in at 22 Union Street, OL1 1BE, Monday to Friday 9am to 5pm, or call first.",
    phone="0161 770 4674", link="https://www.oldham.gov.uk/gow/",
    source="https://www.oldham.gov.uk/news/article/2485/youth_hub_launches_to_help_young_people_find_work_or_training")
GUARANTEE = _route(
    "Youth Guarantee", "Jobcentre Plus",
    "Ask your work coach about it, or send a message in your Universal Credit journal.",
    link=YOUTH_GUARANTEE, source=YOUTH_GUARANTEE)
JOBS_GUARANTEE = _route(
    "Jobs Guarantee: six months of paid work", "DWP, with The Growth Company in Greater Manchester",
    "Your work coach checks if you can be referred.",
    link="https://www.gov.uk/government/publications/jobs-guarantee",
    source="https://www.gov.uk/government/publications/jobs-guarantee")
IN_WORK = _route(
    "Help to earn more in the job you have", "Jobcentre Plus (In-Work Progression)",
    "Send a message in your Universal Credit journal asking for in-work progression support.",
    link="https://www.gov.uk/government/news/government-drive-to-help-workers-on-universal-credit-boost-prospects",
    source="https://www.gov.uk/government/news/government-drive-to-help-workers-on-universal-credit-boost-prospects")
UC_CHECK = _route(
    "Check if you can get Universal Credit", "GOV.UK",
    "Use the free benefits calculators on GOV.UK. Claiming is what opens up most youth employment programmes.",
    link="https://www.gov.uk/benefits-calculators", source="https://www.gov.uk/benefits-calculators")
EMPOWER = _route(
    "Empower Oldham", "Positive Steps",
    "Contact the team: CV and job clinics, work experience, short courses and a mentor.",
    phone="0161 621 9400", link="https://positive-steps.org.uk/services/young-people-engagement-projects/",
    source="https://positive-steps.org.uk/services/young-people-engagement-projects/")

Rule = Callable[[str, str, str], tuple[str, str] | None]  # (age, situation, uc) -> (status, why) or None


def _careers(age: str, situation: str, uc: str):
    if age == "under_18":
        return (NOW, "Not in school or training? A DWP careers adviser can help. In school or college, ask the careers adviser there.") \
            if situation == "not_working" else None
    if situation in ("underemployed", "graduate"):
        return NOW, "Anyone 18 or over can use it, even if you're already working. It's not only for people out of work."
    return NOW, "Anyone 18 or over in England can talk to a careers adviser for free."


def _youth_hub(age: str, situation: str, uc: str):
    if age == "25_plus":
        return (CHECK, "It's for 16 to 25 year olds, so you can still go if you're 25.") if situation != "student" else None
    return NOW, "For 16 to 25 year olds: jobs, apprenticeships and training help in one place, no appointment needed."


def _guarantee(age: str, situation: str, uc: str):
    if age == "25_plus" or situation == "student":
        return None
    if uc == "yes":
        return NOW, "If you're 16 to 24 and on Universal Credit, you can get training, work experience or an apprenticeship through it."
    if situation == "not_working":
        return CHECK, "It's for 16 to 24 year olds on Universal Credit. If you're not claiming, you're missing out on it."
    return None


def _jobs_guarantee(age: str, situation: str, uc: str):
    if age in ("under_18", "25_plus") or situation in ("student", "underemployed") or uc != "yes":
        return None
    return LATER, "For 18 to 24 year olds after 18 months on Universal Credit and looking for work: a paid six-month job, 25 hours a week."


def _in_work(age: str, situation: str, uc: str):
    if situation != "underemployed":
        return None
    if uc == "yes":
        return NOW, "You're working and on Universal Credit, so you can ask a work coach to help you move up or into the field you want."
    return None


def _uc_check(age: str, situation: str, uc: str):
    if age == "under_18" or uc == "yes" or situation == "student":
        return None
    if situation == "underemployed":
        return CHECK, "On low pay or part-time hours? You may be able to get Universal Credit, which also opens up in-work support."
    return CHECK, "You may be able to claim Universal Credit. A claim opens up the Youth Guarantee and a work coach."


def _empower(age: str, situation: str, uc: str):
    if situation != "not_working" or age not in ("under_18", "18", "19_21"):
        return None
    return (NOW, "For 16 to 19 year olds not in work, education or training.") if age != "19_21" \
        else (CHECK, "It's for 16 to 19 year olds, so you can still go if you're 19.")


RULES: list[tuple[dict, Rule]] = [
    (CAREERS, _careers), (UC_CHECK, _uc_check), (GUARANTEE, _guarantee), (IN_WORK, _in_work),
    (YOUTH_HUB, _youth_hub), (EMPOWER, _empower), (JOBS_GUARANTEE, _jobs_guarantee),
]
ORDER = {NOW: 0, CHECK: 1, LATER: 2}


def find(age: str | None, situation: str | None, uc: str | None) -> list[dict]:
    """The services that fit, "now" first. Empty if we don't know the age and situation yet."""
    if age not in AGES or situation not in SITUATIONS:
        return []
    uc = uc if uc in UC else "not_sure"
    out = []
    for route, rule in RULES:
        hit = rule(age, situation, uc)
        if hit:
            out.append({**route, "status": hit[0], "why": hit[1]})
    return sorted(out, key=lambda r: ORDER[r["status"]])


if __name__ == "__main__":
    # The cases the team named: a graduate stacking shelves, a hidden 18 year old, a claimant at 19.
    grad = {r["name"]: r["status"] for r in find("22_24", "underemployed", "no")}
    assert grad["Free careers adviser"] == NOW and "Youth Guarantee" not in grad and grad["Check if you can get Universal Credit"] == CHECK
    hidden = {r["name"]: r["status"] for r in find("18", "not_working", "no")}
    assert hidden["Youth Guarantee"] == CHECK and hidden["Empower Oldham"] == NOW
    claimant = {r["name"]: r["status"] for r in find("19_21", "not_working", "yes")}
    assert claimant["Youth Guarantee"] == NOW and claimant["Jobs Guarantee: six months of paid work"] == LATER
    print("ok")
