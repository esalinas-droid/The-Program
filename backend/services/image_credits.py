"""
Image credit ledger.

Two MongoDB collections:
  - image_credits: one doc per user with current balance + lifetime totals
  - credit_transactions: append-only audit log of every grant/spend/refund/purchase

All functions accept `db` (motor AsyncIOMotorDatabase) as an explicit parameter
to avoid circular imports with server.py.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException

FREE_CREDITS_ON_FIRST_USE = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _ensure_balance_doc(db, userId: str) -> dict:
    """Get or create the user's image_credits doc."""
    doc = await db.image_credits.find_one({"userId": userId})
    if doc:
        return doc
    new_doc = {
        "userId": userId,
        "balance": 0,
        "first_grant_at": None,
        "total_lifetime_granted": 0,
        "total_lifetime_spent": 0,
        "total_lifetime_refunded": 0,
        "updated_at": _now(),
    }
    await db.image_credits.insert_one(new_doc)
    return new_doc


async def _log_transaction(
    db,
    userId: str,
    type_: str,
    amount: int,
    balance_after: int,
    reason: str,
    related_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    doc = {
        "userId": userId,
        "type": type_,
        "amount": amount,
        "balance_after": balance_after,
        "reason": reason,
        "related_id": related_id,
        "created_at": _now(),
    }
    if metadata:
        doc["metadata"] = metadata
    await db.credit_transactions.insert_one(doc)


async def get_balance(db, userId: str) -> int:
    doc = await _ensure_balance_doc(db, userId)
    return doc.get("balance", 0)


async def maybe_grant_first_use_freebie(db, userId: str) -> int:
    """
    Grant 3 credits the FIRST TIME a user uploads an image. Returns the amount
    granted (0 if already granted before).
    """
    doc = await _ensure_balance_doc(db, userId)
    if doc.get("first_grant_at") is not None:
        return 0
    new_balance = doc.get("balance", 0) + FREE_CREDITS_ON_FIRST_USE
    new_lifetime = doc.get("total_lifetime_granted", 0) + FREE_CREDITS_ON_FIRST_USE
    await db.image_credits.update_one(
        {"userId": userId},
        {"$set": {
            "balance": new_balance,
            "first_grant_at": _now(),
            "total_lifetime_granted": new_lifetime,
            "updated_at": _now(),
        }},
    )
    await _log_transaction(db, userId, "grant", FREE_CREDITS_ON_FIRST_USE, new_balance, "first_use_freebie")
    return FREE_CREDITS_ON_FIRST_USE


async def spend_credit(
    db, userId: str, related_id: str, reason: str = "image_parse", metadata: Optional[dict] = None
) -> int:
    """
    Decrement balance by 1. Raises 402 if insufficient. Returns new balance.
    Accepts optional metadata dict (e.g. {"object_path": ...}) stored in the transaction.
    """
    doc = await _ensure_balance_doc(db, userId)
    current = doc.get("balance", 0)
    if current < 1:
        raise HTTPException(status_code=402, detail="Insufficient credits")
    new_balance = current - 1
    await db.image_credits.update_one(
        {"userId": userId},
        {"$set": {
            "balance": new_balance,
            "total_lifetime_spent": doc.get("total_lifetime_spent", 0) + 1,
            "updated_at": _now(),
        }},
    )
    await _log_transaction(db, userId, "spend", 1, new_balance, reason, related_id, metadata)
    return new_balance


async def refund_credit(db, userId: str, related_id: str, reason: str = "parse_failed") -> int:
    """Return a credit to the user (e.g. vision API error, zero exercises parsed). Returns new balance."""
    doc = await _ensure_balance_doc(db, userId)
    new_balance = doc.get("balance", 0) + 1
    await db.image_credits.update_one(
        {"userId": userId},
        {"$set": {
            "balance": new_balance,
            "total_lifetime_refunded": doc.get("total_lifetime_refunded", 0) + 1,
            "updated_at": _now(),
        }},
    )
    await _log_transaction(db, userId, "refund", 1, new_balance, reason, related_id)
    return new_balance


async def add_credits(
    db, userId: str, amount: int, reason: str, related_id: Optional[str] = None
) -> int:
    """Add credits (purchased pack, admin grant). Returns new balance."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    doc = await _ensure_balance_doc(db, userId)
    new_balance = doc.get("balance", 0) + amount
    await db.image_credits.update_one(
        {"userId": userId},
        {"$set": {
            "balance": new_balance,
            "total_lifetime_granted": doc.get("total_lifetime_granted", 0) + amount,
            "updated_at": _now(),
        }},
    )
    txn_type = "purchase" if "pack" in reason else "grant"
    await _log_transaction(db, userId, txn_type, amount, new_balance, reason, related_id)
    return new_balance
