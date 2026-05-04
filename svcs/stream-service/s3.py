"""Optional S3 mirror that shadows the local app_data layout.

Disabled if `AWS_S3_BUCKET` is unset — the rest of the stack (local files,
Postgres, the file-system listing) keeps working unchanged. When enabled,
folder creation and video uploads are mirrored to:

    s3://<AWS_S3_BUCKET>/<AWS_S3_PREFIX>/<user_id>/<folder_path>/<filename>

Folder creation places a 0-byte object with a trailing slash so the AWS
console shows it as a folder; uploads write the video, the .meta.json
sidecar, and (when present) the _cover.jpg side-by-side.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

log = logging.getLogger(__name__)

S3_BUCKET = os.environ.get("AWS_S3_BUCKET", "").strip()
S3_PREFIX = os.environ.get("AWS_S3_PREFIX", "videos").strip("/")
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
    return bool(S3_BUCKET)


def _has_credentials() -> bool:
    """Cheap up-front check so we can log a clear error before the first put."""
    try:
        creds = boto3.Session().get_credentials()
    except Exception:
        return False
    return creds is not None


def log_status() -> None:
    """Called at startup so the operator sees the S3 wiring decision."""
    if not is_enabled():
        log.info("s3: disabled (AWS_S3_BUCKET unset)")
        return
    if not _has_credentials():
        log.warning(
            "s3: bucket=%s region=%s — but no credentials found "
            "(set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in .env). "
            "Folder/upload mirroring will be skipped.",
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


def _put_file(local_path: Path, key: str) -> bool:
    try:
        _get_client().upload_file(
            str(local_path),
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": _content_type(local_path)},
        )
        log.info("s3: uploaded %s -> s3://%s/%s", local_path.name, S3_BUCKET, key)
        return True
    except (ClientError, BotoCoreError, NoCredentialsError) as exc:
        log.warning("s3: upload failed for %s: %s", key, exc)
        return False


def video_key(user_id: str, folder_path: str, filename: str) -> str:
    """Build the S3 key for a stored video. Public mirror of `_key`."""
    return _key(user_id, folder_path, filename)


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


def upload_video_bundle(
    *,
    user_id: str,
    folder_path: str,
    video_path: Path,
    cover_path: Optional[Path],
    meta_path: Optional[Path],
) -> None:
    """Mirror a finished local upload to S3 (video + cover + sidecar)."""
    if not is_enabled():
        log.debug("s3 disabled, skipping upload of %s", video_path.name)
        return

    folder = folder_path.strip("/")
    _put_file(video_path, _key(user_id, folder, video_path.name))
    if cover_path and cover_path.exists():
        _put_file(cover_path, _key(user_id, folder, cover_path.name))
    if meta_path and meta_path.exists():
        _put_file(meta_path, _key(user_id, folder, meta_path.name))
