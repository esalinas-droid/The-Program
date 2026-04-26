"""
Auth Middleware — JWT dependency for FastAPI endpoints.
Requires a valid Bearer token; raises 401 on missing/invalid/expired tokens.

NOTE: The previous implementation fell back to DEFAULT_USER ("user_001") when
the token was missing or invalid. This was a backwards-compat path from the
pre-auth era of the app. It was removed because it caused a silent
data-isolation bug: any user with a missing/expired token would have all
their reads and writes routed to the shared user_001 bucket, corrupting
data across multiple testers. The frontend now handles 401 by clearing
auth and routing to the login screen.
"""
from __future__ import annotations

import os
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

logger = logging.getLogger(__name__)

# DEFAULT_USER is retained as a constant for any legacy code paths that
# reference it directly (e.g. one-off scripts, fixtures). It is no longer
# used as a fallback by get_current_user.
DEFAULT_USER = "user_001"
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
    FastAPI dependency: extracts userId from a valid Bearer token.

    Raises HTTPException(401) if the Authorization header is missing,
    malformed, or contains an invalid/expired JWT. Frontend clients are
    expected to clear stored auth and redirect to login on 401.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    payload = decode_jwt(token)
    if not payload or not payload.get("userId"):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return payload["userId"]
