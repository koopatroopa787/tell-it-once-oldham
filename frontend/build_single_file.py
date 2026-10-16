"""Bundle the Pathly front end into one self-contained HTML file.

    python frontend/build_single_file.py                -> frontend/dist/pathly.html, opens anywhere
    python frontend/build_single_file.py --artifact     -> frontend/dist/pathly-artifact.html, a page
                                                           fragment for publishing as a Claude artifact
    python frontend/build_single_file.py --api-url URL  -> bake a different API address into the bundle

The map library and fonts still load from their CDNs; everything else is inlined.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSS_BLOCK = re.compile(r"<!-- build:inline-css -->(.*?)<!-- /build:inline-css -->", re.S)
JS_BLOCK = re.compile(r"<!-- build:inline-js -->(.*?)<!-- /build:inline-js -->", re.S)


def _inline_css(match: re.Match[str]) -> str:
    files = re.findall(r'href="([^"]+)"', match.group(1))
    return "<style>\n" + "\n".join((HERE / f).read_text() for f in files) + "</style>"


def _script(text: str) -> str:
    return "<script>\n" + re.sub(r"</script", r"<\\/script", text, flags=re.I) + "\n</script>"


def build(artifact: bool, api_url: str | None) -> Path:
    """Write the bundle and return its path."""
    html = (HERE / "index.html").read_text()
    html = CSS_BLOCK.sub(_inline_css, html)

    def inline_js(match: re.Match[str]) -> str:
        parts = []
        for src in re.findall(r'src="([^"]+)"', match.group(1)):
            if src == "config.js" and api_url is not None:
                parts.append(_script("window.PATHLY_CONFIG = " + json.dumps({"apiUrl": api_url}) + ";"))
            else:
                parts.append(_script((HERE / src).read_text()))
        return "\n".join(parts)

    html = JS_BLOCK.sub(inline_js, html)
    if artifact:
        title = re.search(r"<title>.*?</title>", html, re.S).group(0)
        links = "\n".join(re.findall(r'<link rel="(?:preconnect|stylesheet)"[^>]*>', html))
        head = html[html.index("<head>") : html.index("</head>")]
        styles = "\n".join(re.findall(r"<style>.*?</style>", head, re.S))
        body = html[html.index("<body>") + 6 : html.rindex("</body>")]
        html = "\n".join([title, links, styles, body])
    out = HERE / "dist" / ("pathly-artifact.html" if artifact else "pathly.html")
    out.parent.mkdir(exist_ok=True)
    out.write_text(html)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--artifact", action="store_true", help="write a fragment for a Claude artifact")
    parser.add_argument("--api-url", default=None, help="API address to bake in (default: config.js as it is)")
    args = parser.parse_args()
    api_url = args.api_url if args.api_url is not None else ("" if args.artifact else None)
    out = build(args.artifact, api_url)
    print(f"Wrote {out.relative_to(HERE.parent)} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
