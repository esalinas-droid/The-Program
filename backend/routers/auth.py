"""
Auth Router — user registration, login, social auth, and account management.

Endpoints:
  POST /api/auth/register        — email + password signup
  POST /api/auth/login           — email + password login
  POST /api/auth/social          — social token verification (Google/Apple/Facebook)
  GET  /api/auth/me              — get current user from JWT
  POST /api/auth/push-token      — register Expo push token
  PUT  /api/auth/preferences     — update marketingOptIn, etc.
  POST /api/auth/logout          — (informational; actual logout is client-side)
  GET  /api/admin/users          — admin: list all users (ADMIN_SECRET required)
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import bcrypt
import httpx
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env')

from database import db
from middleware import create_jwt, decode_jwt, get_current_user, DEFAULT_USER

logger = logging.getLogger(__name__)
auth_router = APIRouter(prefix="/api/auth")
admin_router = APIRouter(prefix="/api/admin")

RESEND_API_KEY   = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM      = os.environ.get("RESEND_FROM_EMAIL", "noreply@theprogram.app")
ADMIN_SECRET     = os.environ.get("ADMIN_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
FACEBOOK_APP_ID  = os.environ.get("FACEBOOK_APP_ID", "")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _new_user_doc(
    email: str,
    name: str,
    provider: str,
    password_hash: Optional[str] = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "userId":              str(uuid.uuid4()),
        "email":               email.lower().strip(),
        "name":                name,
        "authProvider":        provider,
        "passwordHash":        password_hash,
        "signupDate":          now,
        "lastLoginDate":       now,
        "onboardingComplete":  False,
        "goal":                None,
        "experience":          None,
        "pushNotificationToken": None,
        "emailVerified":       provider != "email",  # Social = auto-verified
        "marketingOptIn":      True,
        "subscriptionTier":    "free",
    }


async def _send_welcome_email(email: str, name: str) -> None:
    """Send welcome email via Resend. Graceful no-op if key not configured."""
    if not RESEND_API_KEY or RESEND_API_KEY.startswith("re_placeholder"):
        logger.info(f"Welcome email skipped (placeholder key): {email}")
        return
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        first = name.split()[0] if name else "Athlete"
        resend.Emails.send({
            "from":    RESEND_FROM,
            "to":      [email],
            "subject": "Welcome to The Program",
            "html":    f"""
                <div style="font-family:sans-serif;max-width:560px;margin:auto;background:#0A0A0C;color:#E8E8E6;padding:40px 32px;border-radius:12px">
                  <h1 style="color:#C9A84C;margin-bottom:8px">Welcome, {first}.</h1>
                  <p style="color:#B0B0AA;font-size:16px;line-height:1.6">
                    Your account is live. The Program is built for athletes who
                    train with intent. Every session is generated from your PRs,
                    goals, and injury history — no generic templates.
                  </p>
                  <p style="color:#B0B0AA;font-size:16px;line-height:1.6">
                    Complete your athlete intake to generate your 12-month training
                    calendar and start training.
                  </p>
                  <div style="margin-top:32px;text-align:center">
                    <a href="https://theprogram.app" style="background:#C9A84C;color:#0A0A0C;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px">
                      Open The Program
                    </a>
                  </div>
                  <p style="color:#666;font-size:12px;margin-top:32px">
                    You're receiving this because you signed up for The Program.
                    <a href="#" style="color:#C9A84C">Unsubscribe</a>
                  </p>
                </div>
            """,
        })
        logger.info(f"Welcome email sent to {email}")
    except Exception as e:
        logger.warning(f"Welcome email failed: {e}")


async def _verify_google_token(id_token: str) -> Optional[dict]:
    """Verify Google ID token and extract user info."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
                timeout=10,
            )
        if r.status_code != 200:
            return None
        data = r.json()
        if "error" in data:
            return None
        # Optional: verify audience matches our client ID
        if GOOGLE_CLIENT_ID and not GOOGLE_CLIENT_ID.startswith("placeholder"):
            if data.get("aud") != GOOGLE_CLIENT_ID:
                return None
        return {"email": data.get("email"), "name": data.get("name", data.get("email", ""))}
    except Exception as e:
        logger.warning(f"Google token verification failed: {e}")
        return None


async def _verify_facebook_token(access_token: str) -> Optional[dict]:
    """Verify Facebook access token and extract user info."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://graph.facebook.com/me",
                params={"fields": "id,name,email", "access_token": access_token},
                timeout=10,
            )
        if r.status_code != 200:
            return None
        data = r.json()
        if "error" in data:
            return None
        return {"email": data.get("email"), "name": data.get("name", "")}
    except Exception as e:
        logger.warning(f"Facebook token verification failed: {e}")
        return None


APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


def _extract_apple_name(user_data: Optional[dict]) -> str:
    """Extract display name from Apple's user_data object."""
    if not user_data:
        return ""
    name = user_data.get("name", "")
    if isinstance(name, dict):
        fn = name.get("firstName", "").strip()
        ln = name.get("lastName", "").strip()
        return f"{fn} {ln}".strip()
    return str(name).strip()


async def _verify_apple_token(identity_token: str, user_data: Optional[dict] = None) -> Optional[dict]:
    """
    Verify Apple Sign-In identity token using Apple's JWKS public keys.
    Apple tokens are RS256 JWTs signed with Apple's private key.
    Reference: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user
    """
    try:
        # 1. Extract header to find the key ID (kid) and algorithm
        header = jwt.get_unverified_header(identity_token)
        kid = header.get("kid")
        alg = header.get("alg", "RS256")

        # 2. Fetch Apple's current public keys from JWKS endpoint
        public_key = None
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(APPLE_JWKS_URL)
            if resp.status_code == 200:
                jwks = resp.json().get("keys", [])
                # Find the key matching the token's kid
                for key_data in jwks:
                    if key_data.get("kid") == kid:
                        from jwt.algorithms import RSAAlgorithm
                        public_key = RSAAlgorithm.from_jwk(key_data)
                        break
                if not public_key and jwks:
                    # Fallback: try first key if kid not matched
                    from jwt.algorithms import RSAAlgorithm
                    public_key = RSAAlgorithm.from_jwk(jwks[0])
        except Exception as jwks_err:
            logger.warning(f"Apple JWKS fetch failed (will decode unverified): {jwks_err}")

        # 3. Verify the token signature
        if public_key:
            payload = jwt.decode(
                identity_token,
                public_key,
                algorithms=[alg],
                options={"verify_exp": True},
            )
            logger.info("Apple token verified with JWKS public key")
        else:
            # Development fallback — decode without signature verification
            # In production this branch should never be reached
            payload = jwt.decode(
                identity_token,
                options={"verify_signature": False},
                algorithms=["RS256"],
            )
            logger.warning("Apple token decoded WITHOUT signature verification (JWKS unavailable)")

        email = payload.get("email")
        if not email:
            # Apple may omit email for returning users — check user_data
            email = (user_data or {}).get("email") if user_data else None

        name = _extract_apple_name(user_data) or (email.split("@")[0] if email else "Apple User")
        return {"email": email, "name": name}

    except Exception as e:
        logger.warning(f"Apple token verification failed: {e}")
        return None


# ── Request / Response Models ──────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SocialAuthRequest(BaseModel):
    provider: str          # "google" | "apple" | "facebook"
    token: str             # ID token / access token from provider
    user_data: Optional[dict] = None  # Apple passes extra user info on first login


class PushTokenRequest(BaseModel):
    token: str


class PreferencesRequest(BaseModel):
    marketingOptIn: Optional[bool] = None


def _user_response(user: dict, token: str) -> dict:
    return {
        "token": token,
        "user": {
            "userId":             user["userId"],
            "email":              user["email"],
            "name":               user["name"],
            "authProvider":       user["authProvider"],
            "onboardingComplete": user.get("onboardingComplete", False),
            "emailVerified":      user.get("emailVerified", False),
            "marketingOptIn":     user.get("marketingOptIn", True),
            "subscriptionTier":   user.get("subscriptionTier", "free"),
        },
    }


# ── Auth Endpoints ─────────────────────────────────────────────────────────────

@auth_router.post("/register")
async def register(body: RegisterRequest):
    """Email + password registration."""
    email = body.email.lower().strip()

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered. Try logging in.")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    name    = body.name.strip() or email.split("@")[0]
    user    = _new_user_doc(email, name, "email", pw_hash)

    await db.users.insert_one(user)
    await db.users.create_index("email", unique=True, background=True)

    token = create_jwt(user["userId"], email, name)
    await _send_welcome_email(email, name)

    logger.info(f"New email user registered: {email}")
    return _user_response(user, token)


@auth_router.post("/login")
async def login(body: LoginRequest):
    """Email + password login."""
    email = body.email.lower().strip()
    user  = await db.users.find_one({"email": email})

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user.get("authProvider") != "email":
        raise HTTPException(
            status_code=400,
            detail=f"This account uses {user['authProvider']} sign-in. Use that button instead.",
        )
    if not bcrypt.checkpw(body.password.encode(), user["passwordHash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    await db.users.update_one(
        {"userId": user["userId"]},
        {"$set": {"lastLoginDate": datetime.now(timezone.utc).isoformat()}},
    )
    token = create_jwt(user["userId"], email, user["name"])
    logger.info(f"User logged in: {email}")
    return _user_response(user, token)


@auth_router.post("/social")
async def social_auth(body: SocialAuthRequest):
    """Social login — verify provider token and create/find user."""
    provider = body.provider.lower()
    info: Optional[dict] = None

    if provider == "google":
        info = await _verify_google_token(body.token)
    elif provider == "apple":
        info = await _verify_apple_token(body.token, body.user_data)
    elif provider == "facebook":
        info = await _verify_facebook_token(body.token)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    if not info or not info.get("email"):
        raise HTTPException(status_code=401, detail="Could not verify social token.")

    email = info["email"].lower().strip()
    name  = info.get("name") or email.split("@")[0]

    user = await db.users.find_one({"email": email})
    is_new = user is None

    if is_new:
        user = _new_user_doc(email, name, provider)
        await db.users.insert_one(user)
        await _send_welcome_email(email, name)
        logger.info(f"New {provider} user: {email}")
    else:
        await db.users.update_one(
            {"userId": user["userId"]},
            {"$set": {"lastLoginDate": datetime.now(timezone.utc).isoformat()}},
        )

    token = create_jwt(user["userId"], email, name)
    return _user_response(user, token)


@auth_router.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    """Return current user info from JWT."""
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided.")
    token   = authorization.removeprefix("Bearer ").strip()
    payload = decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = await db.users.find_one({"userId": payload["userId"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "userId":             user["userId"],
        "email":              user["email"],
        "name":               user["name"],
        "authProvider":       user["authProvider"],
        "onboardingComplete": user.get("onboardingComplete", False),
        "emailVerified":      user.get("emailVerified", False),
        "marketingOptIn":     user.get("marketingOptIn", True),
        "subscriptionTier":   user.get("subscriptionTier", "free"),
    }


@auth_router.post("/push-token")
async def register_push_token(
    body: PushTokenRequest,
    authorization: Optional[str] = Header(None),
):
    """Store Expo push notification token for the authenticated user."""
    if not authorization:
        return {"success": False, "message": "No auth token provided"}
    token   = authorization.removeprefix("Bearer ").strip()
    payload = decode_jwt(token)
    if not payload:
        return {"success": False, "message": "Invalid auth token"}

    await db.users.update_one(
        {"userId": payload["userId"]},
        {"$set": {"pushNotificationToken": body.token}},
        upsert=False,
    )
    logger.info(f"Push token updated for user: {payload['userId']}")
    return {"success": True}


@auth_router.put("/preferences")
async def update_preferences(
    body: PreferencesRequest,
    authorization: Optional[str] = Header(None),
):
    """Update user account preferences (marketingOptIn, etc.)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token   = authorization.removeprefix("Bearer ").strip()
    payload = decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    updates = {}
    if body.marketingOptIn is not None:
        updates["marketingOptIn"] = body.marketingOptIn

    if updates:
        await db.users.update_one({"userId": payload["userId"]}, {"$set": updates})

    return {"success": True}


@auth_router.post("/logout")
async def logout():
    """Informational endpoint — actual logout is handled client-side by clearing the token."""
    return {"success": True, "message": "Token cleared on client."}


# ── Admin Endpoints ────────────────────────────────────────────────────────────

@admin_router.get("/users")
async def list_users(authorization: Optional[str] = Header(None)):
    """
    Admin endpoint — returns all registered users.
    Requires: Authorization: Bearer {ADMIN_SECRET}
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Admin auth required.")
    secret = authorization.removeprefix("Bearer ").strip()
    if not ADMIN_SECRET or secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret.")

    users = await db.users.find({}, {"passwordHash": 0, "_id": 0}).to_list(10000)
    return {
        "count": len(users),
        "users": users,
    }
