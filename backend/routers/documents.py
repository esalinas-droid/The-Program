"""
routers/documents.py — Document upload + parse pipeline (Prompt 7A).

Endpoints:
  POST   /api/documents/upload
  GET    /api/documents
  GET    /api/documents/{doc_id}
  POST   /api/documents/{doc_id}/reparse
  DELETE /api/documents/{doc_id}

File storage: /app/storage/user_documents/{userId}/{docId}.{ext}
Parse: background task via FastAPI BackgroundTasks
Poll: frontend polls GET /api/documents/{id} every 2s while pending/parsing
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from middleware import get_current_user
from document_parser import (
    SUPPORTED_MIME_TYPES,
    MAX_FILE_BYTES,
    check_parse_capabilities,
    parse_document,
)

logger = logging.getLogger(__name__)
documents_router = APIRouter()

STORAGE_BASE = Path("/app/storage/user_documents")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _doc_dir(user_id: str) -> Path:
    p = STORAGE_BASE / user_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _serialize(doc: dict) -> dict:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    for f in ("uploadedAt", "parsedAt"):
        if hasattr(doc.get(f), "isoformat"):
            doc[f] = doc[f].isoformat()
    return doc


# ── Background parse task ───────────────────────────────────────────────────────────

async def _run_parse(db, doc_id: str, file_path: str, content_type: str) -> None:
    """Run the parse pipeline and update the user_documents record."""
    # Mark as parsing
    await db.user_documents.update_one(
        {"documentId": doc_id},
        {"$set": {"parseStatus": "parsing"}},
    )
    try:
        parsed_text, page_count = parse_document(file_path, content_type)
        now = datetime.now(timezone.utc)
        await db.user_documents.update_one(
            {"documentId": doc_id},
            {"$set": {
                "parsedText":   parsed_text,
                "parseStatus":  "complete",
                "parsedAt":     now,
                "pageCount":    page_count,
                "parseError":   None,
            }},
        )
        logger.info("[DOC PARSE] doc=%s complete, %d chars, %d pages", doc_id, len(parsed_text), page_count)
    except Exception as exc:
        err_msg = str(exc)[:500]
        logger.error("[DOC PARSE] doc=%s failed: %s", doc_id, err_msg)
        await db.user_documents.update_one(
            {"documentId": doc_id},
            {"$set": {"parseStatus": "failed", "parseError": err_msg}},
        )


# ── Endpoints ──────────────────────────────────────────────────────────────────

def _inject_db(db):
    """Decorator-free DB injection: documents_router endpoints call this at module level."""
    pass  # DB is accessed via the app state — see setup in server.py


@documents_router.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    userId: str = Depends(get_current_user),
):
    """Upload a file, create the DB record, and kick off background parsing."""
    from server import db  # import here to avoid circular at module load

    # ─ Validate MIME type ──────────────────────────────────────────────────
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{content_type}'. Supported: PDF, JPG, PNG, DOCX, TXT.",
        )

    # ─ Check parse deps are available ──────────────────────────────────────
    caps = check_parse_capabilities()
    if not caps["ok"]:
        missing = [k for k, v in caps["details"].items() if v not in ("ok",) and not v.startswith("tesseract")]
        raise HTTPException(
            status_code=503,
            detail="Document parsing is currently unavailable. Please contact support.",
        )

    # ─ Read file and validate size ──────────────────────────────────────────
    contents = await file.read()
    size_bytes = len(contents)
    if size_bytes > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_bytes // 1024} KB). Maximum is 10 MB.",
        )
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # ─ Save to disk ───────────────────────────────────────────────────────────────
    doc_id  = str(uuid.uuid4())
    ext     = SUPPORTED_MIME_TYPES[content_type]
    storage_dir  = _doc_dir(userId)
    storage_path = str(storage_dir / f"{doc_id}.{ext}")

    with open(storage_path, "wb") as fh:
        fh.write(contents)

    # ─ Create MongoDB record ───────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    record = {
        "documentId":   doc_id,
        "userId":       userId,
        "filename":     file.filename or f"upload.{ext}",
        "contentType":  content_type,
        "sizeBytes":    size_bytes,
        "storagePath":  storage_path,
        "uploadedAt":   now,
        "parsedText":   "",
        "parseStatus":  "pending",
        "parseError":   None,
        "parsedAt":     None,
        "pageCount":    None,
        "documentType": "program",
    }
    await db.user_documents.insert_one(record)
    await db.user_documents.create_index(
        [("userId", 1), ("uploadedAt", -1)], background=True
    )

    # ─ Kick off background parse ────────────────────────────────────────────────
    background_tasks.add_task(_run_parse, db, doc_id, storage_path, content_type)
    logger.info("[DOC UPLOAD] user=%s doc=%s file=%s size=%d", userId, doc_id, file.filename, size_bytes)

    return {"documentId": doc_id, "parseStatus": "pending"}


@documents_router.get("/documents")
async def list_documents(userId: str = Depends(get_current_user)):
    """Return all documents for the user, reverse-chronological, without parsedText."""
    from server import db

    docs = await db.user_documents.find(
        {"userId": userId},
        projection={"parsedText": 0},
    ).sort("uploadedAt", -1).to_list(200)

    return [_serialize(d) for d in docs]


@documents_router.get("/documents/{doc_id}")
async def get_document(doc_id: str, userId: str = Depends(get_current_user)):
    """Return full document including parsedText."""
    from server import db

    doc = await db.user_documents.find_one({"documentId": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc["userId"] != userId:
        raise HTTPException(status_code=403, detail="Not your document.")
    return _serialize(doc)


@documents_router.post("/documents/{doc_id}/reparse")
async def reparse_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    userId: str = Depends(get_current_user),
):
    """Force a fresh parse of an existing document."""
    from server import db

    doc = await db.user_documents.find_one({"documentId": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc["userId"] != userId:
        raise HTTPException(status_code=403, detail="Not your document.")
    if not os.path.exists(doc["storagePath"]):
        raise HTTPException(status_code=409, detail="Source file no longer on disk. Please re-upload.")

    caps = check_parse_capabilities()
    if not caps["ok"]:
        raise HTTPException(
            status_code=503,
            detail="Document parsing is currently unavailable. Please contact support.",
        )

    await db.user_documents.update_one(
        {"documentId": doc_id},
        {"$set": {"parseStatus": "pending", "parseError": None}},
    )
    background_tasks.add_task(_run_parse, db, doc_id, doc["storagePath"], doc["contentType"])
    return {"documentId": doc_id, "parseStatus": "pending"}


@documents_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, userId: str = Depends(get_current_user)):
    """Hard-delete a document record and its file on disk."""
    from server import db

    doc = await db.user_documents.find_one({"documentId": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc["userId"] != userId:
        raise HTTPException(status_code=403, detail="Not your document.")

    # Delete file from disk (best-effort — don't fail if file is already gone)
    storage_path = doc.get("storagePath", "")
    if storage_path and os.path.exists(storage_path):
        try:
            os.remove(storage_path)
        except OSError as exc:
            logger.warning("[DOC DELETE] could not remove file %s: %s", storage_path, exc)

    await db.user_documents.delete_one({"documentId": doc_id})
    return {"deleted": True, "documentId": doc_id}
