"""S3 storage backend — narrow now that app_data is the metadata index.

When `STORAGE=s3`, this module handles three things and nothing else:
    - folder marker creation (mirror of the app_data `mkdir`)
    - streaming the video bytes to S3 on upload
    - presigning a GET URL for streaming playback

Listing, cover serving, and meta lookups all read from app_data, not S3.

Inert when `STORAGE=volume` — `is_enabled()` returns False and every helper
short-circuits.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import BinaryIO, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

log = logging.getLogger(__name__)

STORAGE_BACKEND = os.environ.get("STORAGE", "s3").strip().lower()
S3_BUCKET = os.environ.get("AWS_S3_BUCKET", "drones-ch-store-dev-1").strip()
S3_PREFIX = os.environ.get("AWS_S3_PREFIX", "").strip("/")
S3_REGION = os.environ.get("AWS_REGION", "eu-central-1")

CONTENT_TYPES: dict[str, str] = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
}

_client = None


def is_enabled() -> bool:
    """True only when the S3 backend is selected AND a bucket is configured."""
    return STORAGE_BACKEND == "s3" and bool(S3_BUCKET)


def _has_credentials() -> bool:
    """Cheap up-front check so we can log a clear error before the first put."""
    try:
        creds = boto3.Session().get_credentials()
    except Exception:
        return False
    return creds is not None


def log_status() -> None:
    """Called at startup so the operator sees the S3 wiring decision."""
    if STORAGE_BACKEND != "s3":
        log.info("s3: inactive (STORAGE=%s)", STORAGE_BACKEND)
        return
    if not S3_BUCKET:
        log.error("s3: STORAGE=s3 but AWS_S3_BUCKET is unset — uploads will fail")
        return
    if not _has_credentials():
        log.warning(
            "s3: bucket=%s region=%s — but no credentials found "
            "(set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in .env). "
            "S3 calls will fail.",
            S3_BUCKET,
            S3_REGION,
        )
        return
    log.info("s3: enabled bucket=%s prefix=%s region=%s", S3_BUCKET, S3_PREFIX, S3_REGION)


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("s3", region_name=S3_REGION)
    return _client


def _key(user_id: str, *parts: str) -> str:
    segments = [S3_PREFIX, user_id, *(p.strip("/") for p in parts if p)]
    return "/".join(s for s in segments if s)


def _content_type(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def create_folder_marker(user_id: str, folder_path: str) -> bool:
    """Place a zero-byte object at <prefix>/<user_id>/<folder_path>/.

    The trailing slash is the convention S3 consoles use to render a
    "folder" entry; without it nothing shows up until a child object exists.
    """
    if not is_enabled() or not folder_path:
        return False
    key = _key(user_id, folder_path) + "/"
    try:
        _get_client().put_object(Bucket=S3_BUCKET, Key=key, Body=b"")
        log.info("s3: created folder marker s3://%s/%s", S3_BUCKET, key)
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: folder marker failed for %s: %s", key, exc)
        return False


def delete_folder_marker(user_id: str, folder_path: str) -> bool:
    """Delete the trailing-slash folder marker. Best-effort — returns False
    on failure but doesn't raise."""
    if not is_enabled() or not folder_path:
        return False
    key = _key(user_id, folder_path) + "/"
    try:
        _get_client().delete_object(Bucket=S3_BUCKET, Key=key)
        log.info("s3: deleted folder marker s3://%s/%s", S3_BUCKET, key)
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: delete folder marker failed for %s: %s", key, exc)
        return False


def copy_video(
    user_id: str,
    src_folder: str,
    src_filename: str,
    dst_folder: str,
    dst_filename: str,
) -> bool:
    """Server-side copy. S3 has no rename — `move` is `copy_video` then
    `delete_video`."""
    if not is_enabled():
        return False
    src_key = _key(user_id, src_folder, src_filename)
    dst_key = _key(user_id, dst_folder, dst_filename)
    try:
        _get_client().copy_object(
            Bucket=S3_BUCKET,
            Key=dst_key,
            CopySource={"Bucket": S3_BUCKET, "Key": src_key},
        )
        log.info(
            "s3: copied s3://%s/%s -> s3://%s/%s",
            S3_BUCKET, src_key, S3_BUCKET, dst_key,
        )
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: copy %s -> %s failed: %s", src_key, dst_key, exc)
        return False


def delete_video(user_id: str, folder_path: str, filename: str) -> bool:
    """Delete a single object (typically the .mp4) from S3."""
    if not is_enabled():
        return False
    key = _key(user_id, folder_path, filename)
    try:
        _get_client().delete_object(Bucket=S3_BUCKET, Key=key)
        log.info("s3: deleted s3://%s/%s", S3_BUCKET, key)
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: delete %s failed: %s", key, exc)
        return False


def list_keys(user_id: str, folder_path: str) -> list[str]:
    """Return all object keys under <user>/<folder>/ (recursive). Used by
    the empty-folder check before deletion."""
    if not is_enabled():
        return []
    prefix = _key(user_id, folder_path)
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    keys: list[str] = []
    try:
        paginator = _get_client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
            for obj in page.get("Contents") or []:
                key = obj.get("Key")
                if key:
                    keys.append(key)
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: list_keys failed for %s: %s", prefix, exc)
        return []
    return keys


def folder_marker_key(user_id: str, folder_path: str) -> str:
    """Public helper: the exact key of the trailing-slash folder marker.
    Used to distinguish 'empty folder' (only marker) from 'folder with content'."""
    return _key(user_id, folder_path) + "/"


def video_key(user_id: str, folder_path: str, filename: str) -> str:
    """Build the S3 key for a stored video. Public mirror of `_key`."""
    return _key(user_id, folder_path, filename)


def upload_fileobj(
    user_id: str,
    folder_path: str,
    filename: str,
    fileobj: BinaryIO,
    content_type: Optional[str] = None,
) -> bool:
    """Stream a file-like object straight to S3. Returns True on success."""
    if not is_enabled():
        return False
    key = _key(user_id, folder_path, filename)
    extra: dict = {}
    if content_type:
        extra["ContentType"] = content_type
    else:
        extra["ContentType"] = _content_type(Path(filename))
    try:
        _get_client().upload_fileobj(fileobj, S3_BUCKET, key, ExtraArgs=extra)
        log.info("s3: uploaded fileobj -> s3://%s/%s", S3_BUCKET, key)
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: upload_fileobj failed for %s: %s", key, exc)
        return False


def presign_video_url(
    user_id: str, folder_path: str, filename: str, expires: int = 900
) -> Optional[str]:
    """Convenience wrapper: build the key and presign in one call."""
    return presign_get_url(_key(user_id, folder_path, filename), expires=expires)


def presign_put_url(
    user_id: str,
    folder_path: str,
    filename: str,
    expires: int = 3600,
) -> Optional[str]:
    """Generate a temporary PUT URL so the browser uploads bytes directly to
    S3, bypassing the Python backend. This is the only sane path for big
    videos — pushing 4 GB through Starlette buffers it to disk first, then
    re-streams to S3, doubling the wall-clock and exposing the upload to
    every proxy timeout in the chain.

    The bucket needs CORS configured to allow PUT from the frontend origin
    (see operator notes in the README) — without it the browser blocks the
    PUT before it leaves.

    Content-Type is intentionally NOT included in the signature; the
    browser will set it from the File MIME type and we don't want a 403
    over a header mismatch. S3 stores whatever Content-Type the PUT sends.
    """
    if not is_enabled():
        return None
    key = _key(user_id, folder_path, filename)
    try:
        signer = boto3.client(
            "s3",
            region_name=S3_REGION,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
            ),
        )
        return signer.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires,
            HttpMethod="PUT",
        )
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: presign PUT failed for %s: %s", key, exc)
        return None


def head_object(
    user_id: str, folder_path: str, filename: str
) -> Optional[dict]:
    """HEAD an object to confirm it exists after a presigned PUT. Returns
    `{size, content_type}` on success, None if missing or on error."""
    if not is_enabled():
        return None
    key = _key(user_id, folder_path, filename)
    try:
        resp = _get_client().head_object(Bucket=S3_BUCKET, Key=key)
        return {
            "size": int(resp.get("ContentLength") or 0),
            "content_type": resp.get("ContentType"),
        }
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: head_object failed for %s: %s", key, exc)
        return None


def presign_get_url(key: str, expires: int = 900) -> Optional[str]:
    """Generate a temporary GET URL for an S3 object.

    Mirrors helper_scripts/generate.py: SigV4 + virtual-hosted addressing,
    HEAD-checks the object first so a missing key turns into None instead of
    a presign for a non-existent path.
    """
    if not is_enabled():
        return None
    try:
        signer = boto3.client(
            "s3",
            region_name=S3_REGION,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
            ),
        )
        signer.head_object(Bucket=S3_BUCKET, Key=key)
        return signer.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires,
            HttpMethod="GET",
        )
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: presign failed for %s: %s", key, exc)
        return None


