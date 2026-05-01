# System Dependencies

This codebase requires the following system packages installed
in any container running the backend:

- tesseract-ocr (for OCR on scanned PDFs and images)
- poppler-utils (for PDF→image conversion needed by OCR)

Install via: apt-get install -y tesseract-ocr poppler-utils

These are required by backend/document_parser.py for the
import-program flow. The parser will fail at startup self-test
if either is missing. See backend/server.py lines 2423-2434
for the self-test.

Local development: also installed via on-restart.sh (which is
not in version control because it's hooked into Emergent's
/entrypoint.sh).
