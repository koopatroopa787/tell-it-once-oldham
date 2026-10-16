"""Reading uploaded CVs: PDF, Word and text, with personal details removed."""

from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient

import api
import documents

client = TestClient(api.app)

CV = "Jordan Smith\njordan@example.com 07700 900123\nlinkedin.com/in/jordan\nGCSEs in Maths and Art\nVolunteered at a food bank"


def _docx(text: str) -> bytes:
    paras = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.splitlines())
    xml = f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paras}</w:body></w:document>'
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("word/document.xml", xml)
    return out.getvalue()


def _pdf(text: str) -> bytes:
    """A one-page PDF with real text, built by hand so the test needs no PDF writer."""
    stream = "BT /F1 12 Tf 72 720 Td 14 TL " + " ".join(f"({line}) '" for line in text.splitlines()) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = "%PDF-1.4\n", []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return out.encode("latin-1")


def _check(text: str, removed: list[str]) -> None:
    assert "Jordan" not in text and "jordan@" not in text and "07700" not in text and "linkedin" not in text
    assert "GCSEs in Maths and Art" in text and "food bank" in text
    assert {"name", "email address", "phone number", "web link"} <= set(removed)


def test_reads_each_format_and_removes_personal_details() -> None:
    for content_type, body in ((documents.PDF, _pdf(CV)), (documents.DOCX, _docx(CV)), (documents.TEXT, CV.encode())):
        response = client.post("/api/read-doc", content=body, headers={"Content-Type": content_type})
        assert response.status_code == 200, (content_type, response.text)
        _check(response.json()["text"], response.json()["removed"])


def test_keeps_a_first_line_that_is_not_a_name() -> None:
    text, removed = documents.read_document(b"I like football and coding\nYear 11", documents.TEXT)
    assert text.startswith("I like football") and "NAME" not in removed


def test_rejects_bad_uploads() -> None:
    post = lambda body, kind: client.post("/api/read-doc", content=body, headers={"Content-Type": kind}).status_code
    assert post(b"x", "image/png") == 415
    assert post(b"", documents.TEXT) == 422
    assert post(b"not a pdf", documents.PDF) == 422
    assert post(b" \n ", documents.TEXT) == 422
    assert post(b"a" * (documents.DOC_LIMIT + 1), documents.TEXT) == 413
