"""
Auth Middleware — JWT dependency for FastAPI endpoints.
Option A: Falls back to DEFAULT_USER if no valid JWT provided.
"""
from __future__ import annotations

import os
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

logger = logging.getLogger(__name__)

DEFAULT_USER = "user_001"  # Backwards-compatible fallback (Option A)
JWT_SECRET    = os.environ.get("JWT_SECRET", "fallback-dev-secret-change-in-prod")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))


def create_jwt(user_id: str, email: str, name: str) -> str:
    """Create a signed JWT token for a user."""
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "email":  email,
        "name":   name,
        "iat":    now,
        "exp":    now + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[dict]:
    """Decode and verify a JWT token. Returns payload dict or None."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    FastAPI dependency: extracts userId from Bearer token.
    Falls back to DEFAULT_USER if no/invalid token (Option A backwards compat).
    """
    if not authorization:
        return DEFAULT_USER
    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_jwt(token)
    if payload:
        return payload.get("userId", DEFAULT_USER)
    return DEFAULT_USER
