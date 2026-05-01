"""
document_parser.py — Text extraction pipeline for uploaded user documents.

Supports:
  PDF      : embedded-text extraction via pdfplumber; OCR fallback via
             pytesseract + pdf2image for scanned documents.
  Image    : OCR via pytesseract (JPG, PNG, HEIC)
  DOCX     : python-docx
  TXT      : plain read

System requirements (must be installed at container level):
  apt-get install -y tesseract-ocr poppler-utils
  See /root/.emergent/on-restart.sh for the persistence hook.
"""

import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# ── Supported MIME types ─────────────────────────────────────────────────────
SUPPORTED_MIME_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}

MAX_FILE_BYTES   = 10 * 1024 * 1024   # 10 MB
MIN_PDF_TEXT_LEN = 100                 # below this we assume scanned PDF


# ── Startup capability check ────────────────────────────────────────────────────
def check_parse_capabilities() -> dict:
    """
    Run once at server startup. Returns a dict describing the availability
    of each parse dependency.  'ok' is False if anything critical is missing.
    """
    result: dict = {"ok": True, "details": {}}

    # Check tesseract binary
    try:
        proc = subprocess.run(
            ["tesseract", "--version"],
            capture_output=True, text=True, timeout=5,
        )
        ver_line = (proc.stdout or proc.stderr or "").strip().split("\n")[0]
        result["details"]["tesseract"] = ver_line if proc.returncode == 0 else "error"
        if proc.returncode != 0:
            result["ok"] = False
    except FileNotFoundError:
        result["details"]["tesseract"] = "NOT FOUND"
        result["ok"] = False

    # Check pdftoppm binary (poppler)
    try:
        proc = subprocess.run(
            ["pdftoppm", "-v"],
            capture_output=True, text=True, timeout=5,
        )
        ver_line = (proc.stderr or proc.stdout or "").strip().split("\n")[0]
        result["details"]["pdftoppm"] = ver_line or "ok"
    except FileNotFoundError:
        result["details"]["pdftoppm"] = "NOT FOUND"
        result["ok"] = False

    # Check Python libraries
    lib_map = {
        "pypdf":       "pypdf",
        "pdfplumber":  "pdfplumber",
        "pdf2image":   "pdf2image",
        "pytesseract": "pytesseract",
        "python-docx": "docx",
        "Pillow":      "PIL",
    }
    for display_name, import_name in lib_map.items():
        try:
            __import__(import_name)
            result["details"][display_name] = "ok"
        except ImportError:
            result["details"][display_name] = "NOT INSTALLED"
            result["ok"] = False

    return result


# ── Parse helpers ──────────────────────────────────────────────────────────────────

def _extract_pdf_text(file_path: str) -> tuple[str, int]:
    """Extract text from a PDF. Falls back to OCR if embedded text is sparse."""
    import pdfplumber

    text_parts: list[str] = []
    page_count = 0
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                t = page.extract_text() or ""
                text_parts.append(t)
    except Exception as exc:
        logger.warning("pdfplumber failed on %s: %s", file_path, exc)

    full_text = "\n".join(text_parts).strip()

    if len(full_text) < MIN_PDF_TEXT_LEN:
        logger.info(
            "PDF has only %d chars of embedded text — falling back to OCR",
            len(full_text),
        )
        return _ocr_pdf(file_path)

    return full_text, page_count


def _ocr_pdf(file_path: str) -> tuple[str, int]:
    """Rasterise PDF pages and run OCR on each."""
    from pdf2image import convert_from_path
    import pytesseract

    try:
        images = convert_from_path(file_path, dpi=200)
    except Exception as exc:
        raise RuntimeError(f"pdf2image conversion failed: {exc}") from exc

    texts = [pytesseract.image_to_string(img) or "" for img in images]
    return "\n\n".join(texts).strip(), len(images)


def _extract_image_text(file_path: str) -> tuple[str, int]:
    """Run OCR on a single image file."""
    import pytesseract
    from PIL import Image

    img = Image.open(file_path)
    # Convert HEIC or unusual modes to RGB so tesseract is happy
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    text = pytesseract.image_to_string(img) or ""
    return text.strip(), 1


def _extract_docx_text(file_path: str) -> tuple[str, int]:
    """Extract plain text from a .docx file."""
    import docx

    doc = docx.Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    # Also extract text from tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    paragraphs.append(cell.text.strip())
    text = "\n".join(paragraphs)
    page_count = max(1, len(doc.sections))
    return text, page_count


def _extract_txt(file_path: str) -> tuple[str, int]:
    """Read a plain-text file."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    return text, 1


# ── Public entry point ──────────────────────────────────────────────────────────────────

def parse_document(file_path: str, content_type: str) -> tuple[str, int]:
    """
    Extract text from the given file.  Returns (text, page_count).
    Raises RuntimeError on unrecoverable parse failure.
    Raises ValueError for unsupported content types.
    """
    ct = content_type.lower().strip()

    if ct == "application/pdf":
        return _extract_pdf_text(file_path)

    if ct in ("image/jpeg", "image/jpg", "image/png", "image/heic"):
        return _extract_image_text(file_path)

    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx_text(file_path)

    if ct == "text/plain":
        return _extract_txt(file_path)

    raise ValueError(f"Unsupported content type: {content_type!r}")
