"""
routers/documents.py — Document upload + parse pipeline (Prompt 7A) and
LLM plan extraction (Prompt 7B).

Endpoints:
  POST   /api/documents/upload
  GET    /api/documents
  GET    /api/documents/{doc_id}
  POST   /api/documents/{doc_id}/reparse
  DELETE /api/documents/{doc_id}
  POST   /api/documents/{doc_id}/build-plan            (7B — LLM extraction)
  POST   /api/documents/{doc_id}/activate-extracted-plan (7B — commit plan)

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


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT 7B — LLM plan extraction endpoints
# ─────────────────────────────────────────────────────────────────────────────

@documents_router.post("/documents/{doc_id}/build-plan")
async def build_plan_from_document(
    doc_id: str,
    userId: str = Depends(get_current_user),
):
    """
    LLM extraction: convert parsedText from a document into a proposed AnnualPlan.

    Does NOT save the plan. Returns proposedPlan + confidence for user review.
    The client must call /activate-extracted-plan to commit.
    """
    import os as _os
    from server import db

    # ── Guard: EMERGENT_LLM_KEY must be present ──────────────────────────────
    emergent_key = _os.environ.get("EMERGENT_LLM_KEY", "")
    if not emergent_key:
        raise HTTPException(
            status_code=503,
            detail="AI extraction unavailable — EMERGENT_LLM_KEY not configured.",
        )

    # ── Validate document ownership and parse state ──────────────────────────
    doc = await db.user_documents.find_one({"documentId": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc["userId"] != userId:
        raise HTTPException(status_code=403, detail="Not your document.")
    if doc.get("parseStatus") != "complete":
        raise HTTPException(
            status_code=400,
            detail="Document parse not yet complete. Please wait for parsing to finish.",
        )
    parsed_text = doc.get("parsedText", "").strip()
    if not parsed_text:
        raise HTTPException(
            status_code=400,
            detail="No text was extracted from this document. Try re-parsing it first.",
        )

    # ── Load user profile + PRs ───────────────────────────────────────────────
    profile_doc = await db.profile.find_one({"userId": userId}) or {}
    prs_cursor  = db.prs.find({"userId": userId}).sort("date", -1).limit(10)
    prs_docs    = await prs_cursor.to_list(10)

    # ── Run LLM extraction ────────────────────────────────────────────────────
    from services.plan_extractor import extract_plan_from_text, build_annual_plan, log_extraction

    extraction_meta: dict = {}
    plan_dict: dict = {}
    confidence: dict = {}
    success = False
    skeleton_mode = False

    try:
        extraction_meta = await extract_plan_from_text(
            parsed_text  = parsed_text,
            profile      = profile_doc,
            prs          = prs_docs,
            emergent_key = emergent_key,
        )
        extracted  = extraction_meta["extracted"]
        confidence = extracted.get("confidence", {})
        skeleton_mode = bool(confidence.get("couldn_extract_sessions", False))

        # Build the full AnnualPlan from the extracted structure
        plan_dict = build_annual_plan(
            extracted = extracted,
            user_id   = userId,
            doc_id    = doc_id,
        )
        success = True

        logger.info(
            "[BUILD PLAN] user=%s doc=%s skeleton=%s phases=%d total_weeks=%d cost=$%.4f",
            userId, doc_id, skeleton_mode,
            len(extracted.get("phases", [])),
            extracted.get("totalWeeks", 0),
            extraction_meta.get("approx_cost_usd", 0),
        )

    except Exception as exc:
        logger.error("[BUILD PLAN] user=%s doc=%s error=%s", userId, doc_id, exc)
        await log_extraction(
            db              = db,
            user_id         = userId,
            doc_id          = doc_id,
            input_chars     = extraction_meta.get("input_chars", 0),
            output_chars    = extraction_meta.get("output_chars", 0),
            latency_seconds = extraction_meta.get("latency_seconds", 0),
            approx_cost_usd = extraction_meta.get("approx_cost_usd", 0),
            success         = False,
            skeleton_mode   = False,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Plan extraction failed: {str(exc)[:300]}",
        )

    # ── Log the extraction ────────────────────────────────────────────────────
    await log_extraction(
        db              = db,
        user_id         = userId,
        doc_id          = doc_id,
        input_chars     = extraction_meta.get("input_chars", 0),
        output_chars    = extraction_meta.get("output_chars", 0),
        latency_seconds = extraction_meta.get("latency_seconds", 0),
        approx_cost_usd = extraction_meta.get("approx_cost_usd", 0),
        success         = success,
        skeleton_mode   = skeleton_mode,
    )

    # Strip internal metadata key from the plan dict before returning
    plan_dict.pop("_has_sessions", None)

    return {
        "proposedPlan":      plan_dict,
        "confidence":        confidence,
        "documentId":        doc_id,
        "skeletonMode":      skeleton_mode,
        "approxCostUsd":     extraction_meta.get("approx_cost_usd", 0),
        "latencySeconds":    extraction_meta.get("latency_seconds", 0),
    }


class ActivatePlanBody(BaseModel):
    planName:     Optional[str] = None   # user-edited name (may differ from LLM name)
    proposedPlan: dict = Field(default_factory=dict)


@documents_router.post("/documents/{doc_id}/activate-extracted-plan")
async def activate_extracted_plan(
    doc_id: str,
    body: ActivatePlanBody,
    userId: str = Depends(get_current_user),
):
    """
    Commit an extracted plan: archive the current active plan (if any),
    save the new plan as active, and set has_imported_program=True on profile.
    """
    from server import db
    from services.plan_extractor import build_annual_plan
    from models.schemas import AnnualPlan

    # ── Validate document ownership ───────────────────────────────────────────
    doc = await db.user_documents.find_one({"documentId": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc["userId"] != userId:
        raise HTTPException(status_code=403, detail="Not your document.")

    # ── Validate proposedPlan ─────────────────────────────────────────────────
    proposed = body.proposedPlan
    if not proposed or not proposed.get("planId"):
        raise HTTPException(status_code=400, detail="proposedPlan is missing or malformed.")

    # Apply user-edited name if provided
    if body.planName:
        proposed["name"]     = body.planName[:50]
        proposed["planName"] = f"Imported: {body.planName[:50]}"

    # Ensure ownership and sourceDocumentId are correct (don't trust frontend)
    proposed["userId"]           = userId
    proposed["sourceDocumentId"] = doc_id
    proposed["status"]           = "active"
    proposed["archivedAt"]       = None

    # Pydantic-validate the incoming dict (re-raises ValueError on bad data)
    try:
        plan = AnnualPlan(**{k: v for k, v in proposed.items() if not k.startswith("_")})
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Proposed plan failed validation: {str(exc)[:400]}",
        )

    now = datetime.now(timezone.utc)

    # ── Archive current active plan (if any) ──────────────────────────────────
    active_doc = await db.saved_plans.find_one({"userId": userId, "status": "active"})
    if active_doc:
        # Snapshot lastActiveWeek before archiving
        start_date = active_doc.get("startDate", "")
        try:
            from datetime import datetime as _dt
            start = _dt.strptime(start_date[:10], "%Y-%m-%d")
            days_elapsed = (datetime.now() - start).days
            last_active_week = max(1, (days_elapsed // 7) + 1)
        except Exception:
            last_active_week = active_doc.get("lastActiveWeek", 1)

        await db.saved_plans.update_one(
            {"_id": active_doc["_id"]},
            {"$set": {
                "status":         "archived",
                "archivedAt":     now.isoformat(),
                "lastActiveWeek": last_active_week,
            }},
        )
        logger.info(
            "[ACTIVATE PLAN] archived prior plan=%s for user=%s",
            active_doc.get("planId"), userId,
        )

    # ── Save new plan ─────────────────────────────────────────────────────────
    plan_dict = plan.model_dump(mode="json")
    plan_dict["_saved_at"] = now.isoformat()
    if not plan_dict.get("createdAt"):
        plan_dict["createdAt"] = now.isoformat()

    await db.saved_plans.replace_one(
        {"planId": plan.planId},
        plan_dict,
        upsert=True,
    )

    # ── Update profile ────────────────────────────────────────────────────────
    await db.profile.update_one(
        {"userId": userId},
        {"$set": {
            "has_imported_program": True,
            "onboardingComplete":   True,
            "training_mode":        "program",
            "updatedAt":            now,
        }},
        upsert=True,
    )

    logger.info(
        "[ACTIVATE PLAN] saved new plan=%s for user=%s doc=%s",
        plan.planId, userId, doc_id,
    )

    return {"success": True, "planId": plan.planId}
