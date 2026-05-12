"""
Supabase Storage wrapper for tracker images.

Uses the service role key (full admin) — never expose to frontend.
Frontend gets short-lived signed URLs only.
"""

import os
import uuid
from typing import Optional
from supabase import create_client, Client

_BUCKET = "tracker-images"
_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var not set")
        _client = create_client(url, key)
    return _client


def upload_tracker_image(userId: str, image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """
    Upload an image to the tracker-images bucket under {userId}/{uuid}.{ext}.
    Returns {object_path, image_id, signed_url} — signed URL expires in 1 hour.
    """
    client = _get_client()
    image_id = str(uuid.uuid4())
    ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/heic": "heic"}
    extension = ext_map.get(content_type, "jpg")
    object_path = f"{userId}/{image_id}.{extension}"

    client.storage.from_(_BUCKET).upload(
        path=object_path,
        file=image_bytes,
        file_options={"content-type": content_type},
    )

    signed = client.storage.from_(_BUCKET).create_signed_url(
        path=object_path,
        expires_in=3600,  # 1 hour
    )
    return {
        "object_path": object_path,
        "image_id": image_id,
        "signed_url": signed["signedURL"],
    }


def get_signed_url(object_path: str, expires_in: int = 3600) -> str:
    """Mint a fresh signed URL for an existing image."""
    client = _get_client()
    signed = client.storage.from_(_BUCKET).create_signed_url(
        path=object_path, expires_in=expires_in
    )
    return signed["signedURL"]


def delete_tracker_image(object_path: str) -> None:
    """Delete an image. Used when a user removes their session."""
    client = _get_client()
    client.storage.from_(_BUCKET).remove([object_path])
