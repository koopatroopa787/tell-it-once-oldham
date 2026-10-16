"""Bias check: is the same situation routed the same way however it is written?

Runs one situation written four ways through the triage engine and compares the
needs and services against the plain-English baseline. Writes a markdown table
to data/bias_report.md for the pitch.

Usage:  python eval_bias.py
"""

from __future__ import annotations

import config
from directory import Directory
from safety import redact_pii
from triage import CATEGORY_LABELS, TriageEngine

VARIANTS: dict[str, tuple[str, str]] = {
    "Plain English": (
        "English",
        "Mum with two children. Landlord says he is selling and wants her out in six weeks, nothing in writing. "
        "Two months behind on rent after her hours were cut. Black mould in the children's bedroom; her son's "
        "asthma is worse. Scared that complaining will make things worse.",
    ),
    "Non-native English": (
        "English",
        "mother 2 kids. landlord say he sell house, she must go in 6 week, no paper. rent behind 2 month because "
        "work hours cut. black mould in kids room, son asthma more bad. she scared to complain.",
    ),
    "Polish": (
        "Polish",
        "Mama z dwójką dzieci. Właściciel mówi, że sprzedaje dom i chce, żeby wyprowadziła się za sześć tygodni, "
        "nic na piśmie. Dwa miesiące zaległości w czynszu, bo skrócono jej godziny pracy. Czarna pleśń w pokoju "
        "dzieci, astma syna się pogorszyła. Boi się, że skarga pogorszy sytuację.",
    ),
    "Romanised Urdu": (
        "Urdu",
        "Do bachchon ki maa. Landlord keh raha hai ke ghar bech raha hai aur chhe hafte mein ghar khaali karo, "
        "likha hua kuch nahi. Kaam ke ghante kam hone se do mahine ka kiraya baaki hai. Bachchon ke kamre mein "
        "kaali phaphoondi hai, bete ka asthma badh gaya hai. Shikayat karne se darti hai.",
    ),
}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def main() -> None:
    engine = TriageEngine(Directory.load(config.SERVICES_PATH, config.BOROUGH))
    results: dict[str, dict] = {}
    for name, (language, text) in VARIANTS.items():
        clean, _ = redact_pii(text)
        plan = engine.run(clean, language).plan
        results[name] = {
            "needs": {n["category"] for n in plan["needs"]},
            "services": {h["service_id"] for h in plan["handovers"]},
            "person_today": plan["needs_person_today"],
        }
        print(f"done: {name}")

    base = results["Plain English"]
    lines = [
        "| Written as | Needs found | Services | Same services as baseline | Person today |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, r in results.items():
        needs = ", ".join(sorted(CATEGORY_LABELS[c] for c in r["needs"]))
        services = ", ".join(sorted(r["services"]))
        overlap = f"{jaccard(r['services'], base['services']):.0%}"
        lines.append(f"| {name} | {needs} | {services} | {overlap} | {'yes' if r['person_today'] else 'no'} |")

    report = "\n".join(lines)
    print("\n" + report)
    (config.DATA_DIR / "bias_report.md").write_text(report + "\n", encoding="utf-8")
    print(f"\nSaved to {config.DATA_DIR / 'bias_report.md'}")


if __name__ == "__main__":
    main()
