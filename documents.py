"""Read an uploaded CV or document into plain text, with personal details taken out.

PDF (via pypdf), Word .docx (stdlib zip + XML) and plain text. Nothing is saved:
the file is read in memory and only the cleaned text goes back to the browser.
"""

from __future__ import annotations

import io
import re
import zipfile
from xml.etree import ElementTree

from pypdf import PdfReader

from safety import redact_pii

DOC_LIMIT = 5 * 1024 * 1024
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT = "text/plain"
TYPES = (PDF, DOCX, TEXT)

_URL = re.compile(r"\b(?:https?://|www\.)\S+|\b(?:linkedin|github)\.com/\S+", re.IGNORECASE)
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class UnreadableDocument(ValueError):
    pass


def _extract(data: bytes, content_type: str) -> str:
    try:
        if content_type == PDF:
            return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages[:10])
        if content_type == DOCX:
            root = ElementTree.fromstring(zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml"))
            return "\n".join("".join(t.text or "" for t in p.iter(f"{_W}t")) for p in root.iter(f"{_W}p"))
        return data.decode("utf-8", errors="replace")
    except Exception as exc:  # broken, encrypted or mislabelled files all mean the same thing to the user
        raise UnreadableDocument("We couldn't read that file.") from exc


def _looks_like_name(line: str) -> bool:
    words = line.split()
    return 1 <= len(words) <= 4 and all(re.fullmatch(r"[A-Z][A-Za-z'\-]*\.?", w) for w in words)


def read_document(data: bytes, content_type: str) -> tuple[str, list[str]]:
    """Return the cleaned text and the PII tags removed. Raises UnreadableDocument."""
    lines = [re.sub(r"\s+", " ", line).strip() for line in _extract(data, content_type).splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        raise UnreadableDocument("That file has no text we can read. A scanned photo won't work, try a PDF or Word file.")
    removed: list[str] = []
    # ponytail: a CV's first line is nearly always the person's name; a proper name detector if that stops holding
    if _looks_like_name(lines[0]):
        lines, removed = lines[1:], ["NAME"]
    text, found = redact_pii(_URL.sub("[LINK]", "\n".join(lines)))
    if "[LINK]" in text:
        found.append("LINK")
    return text, removed + found
