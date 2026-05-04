"""Database connection and migration runner.

Migrations are managed by Alembic; the application calls ``run_migrations()``
on startup so the schema is always at head before any request is served.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)

DEFAULT_DATABASE_URL = "postgresql+psycopg://drone:drone@db:5432/drone"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)

_engine: Optional[Engine] = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
    return _engine


def run_migrations() -> None:
    """Apply any pending Alembic migrations against the configured database."""
    from alembic import command
    from alembic.config import Config

    here = Path(__file__).parent
    cfg = Config(str(here / "alembic.ini"))
    cfg.set_main_option("script_location", str(here / "alembic"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    log.info("running alembic upgrade head against %s", _redact(DATABASE_URL))
    command.upgrade(cfg, "head")


def _redact(url: str) -> str:
    # Hide the password segment when logging a URL.
    if "://" in url and "@" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            creds, host = rest.split("@", 1)
            if ":" in creds:
                user, _ = creds.split(":", 1)
                return f"{scheme}://{user}:***@{host}"
    return url


def get_video(video_id: str) -> Optional[dict]:
    """Fetch a single video row by its UUID. Returns None if not found / invalid id."""
    with get_engine().begin() as conn:
        try:
            row = conn.execute(
                text(
                    """
                    SELECT id::text AS id, user_id, folder_path, filename, cover_filename
                    FROM drone_space.videos
                    WHERE id = :id
                    """
                ),
                {"id": video_id},
            ).mappings().first()
        except Exception as exc:  # noqa: BLE001 — invalid uuid raises DBAPIError
            log.warning("get_video(%s) failed: %s", video_id, exc)
            return None
    return dict(row) if row else None


def list_video_ids(user_id: str, folder_path: str) -> dict[str, str]:
    """Return {filename: id} for the videos in a given folder."""
    return {f: m["id"] for f, m in list_video_meta(user_id, folder_path).items()}


def list_video_meta(user_id: str, folder_path: str) -> dict[str, dict]:
    """Return {filename: {id, visibility}} for videos in a given folder."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id::text AS id, filename, visibility
                FROM drone_space.videos
                WHERE user_id = :u AND folder_path = :p
                """
            ),
            {"u": user_id, "p": folder_path},
        ).mappings().all()
    return {
        r["filename"]: {"id": r["id"], "visibility": r["visibility"]}
        for r in rows
    }


# ---------------------------------------------------------------------------
# Sharing & visibility
# ---------------------------------------------------------------------------

VALID_VISIBILITY = {"public", "private"}


def set_video_visibility(video_id: str, visibility: str) -> None:
    if visibility not in VALID_VISIBILITY:
        raise ValueError(
            "visibility must be one of: " + ", ".join(VALID_VISIBILITY)
        )
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE drone_space.videos SET visibility = :v WHERE id = :id"),
            {"v": visibility, "id": video_id},
        )


def share_video(video_id: str, shared_with: str, shared_by: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO drone_space.video_shares
                  (video_id, shared_with_user_id, shared_by_user_id)
                VALUES (:vid, :w, :b)
                ON CONFLICT (video_id, shared_with_user_id) DO NOTHING
                """
            ),
            {"vid": video_id, "w": shared_with, "b": shared_by},
        )


def unshare_video(video_id: str, shared_with: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                DELETE FROM drone_space.video_shares
                WHERE video_id = :vid AND shared_with_user_id = :w
                """
            ),
            {"vid": video_id, "w": shared_with},
        )


def list_video_shares(video_id: str) -> list[dict]:
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT shared_with_user_id, shared_by_user_id, created_at
                FROM drone_space.video_shares
                WHERE video_id = :vid
                ORDER BY created_at
                """
            ),
            {"vid": video_id},
        ).mappings().all()
    return [dict(r) for r in rows]


def share_folder(
    owner: str, path: str, shared_with: str, shared_by: str
) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO drone_space.folder_shares
                  (owner_user_id, folder_path, shared_with_user_id, shared_by_user_id)
                VALUES (:o, :p, :w, :b)
                ON CONFLICT (owner_user_id, folder_path, shared_with_user_id)
                  DO NOTHING
                """
            ),
            {"o": owner, "p": path, "w": shared_with, "b": shared_by},
        )


def unshare_folder(owner: str, path: str, shared_with: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                DELETE FROM drone_space.folder_shares
                WHERE owner_user_id = :o
                  AND folder_path = :p
                  AND shared_with_user_id = :w
                """
            ),
            {"o": owner, "p": path, "w": shared_with},
        )


def list_folder_shares(owner: str, path: str) -> list[dict]:
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT shared_with_user_id, shared_by_user_id, created_at
                FROM drone_space.folder_shares
                WHERE owner_user_id = :o AND folder_path = :p
                ORDER BY created_at
                """
            ),
            {"o": owner, "p": path},
        ).mappings().all()
    return [dict(r) for r in rows]


def list_shared_with(user_id: str) -> list[dict]:
    """Videos accessible to user_id via explicit video- OR folder-share."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT DISTINCT
                  v.id::text AS id,
                  v.user_id,
                  v.folder_path,
                  v.filename,
                  v.cover_filename,
                  v.size_bytes,
                  v.location,
                  v.latitude,
                  v.longitude,
                  v.height_m,
                  v.tags,
                  v.taken_at,
                  v.drone_type,
                  v.uploaded_at,
                  v.visibility,
                  CASE
                    WHEN vs.video_id IS NOT NULL THEN 'video'
                    ELSE 'folder'
                  END AS share_type,
                  COALESCE(vs.shared_by_user_id, fs.shared_by_user_id)
                    AS shared_by_user_id
                FROM drone_space.videos v
                LEFT JOIN drone_space.video_shares vs
                  ON vs.video_id = v.id AND vs.shared_with_user_id = :uid
                LEFT JOIN drone_space.folder_shares fs
                  ON fs.owner_user_id = v.user_id
                  AND (fs.folder_path = v.folder_path
                       OR v.folder_path LIKE fs.folder_path || '/%')
                  AND fs.shared_with_user_id = :uid
                WHERE vs.video_id IS NOT NULL OR fs.owner_user_id IS NOT NULL
                ORDER BY v.uploaded_at DESC
                """
            ),
            {"uid": user_id},
        ).mappings().all()
    return [dict(r) for r in rows]


def user_can_access_video(user_id: str, video_id: str) -> bool:
    """True if user owns it, it's public, or it's shared via video / folder share."""
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT 1 FROM drone_space.videos v
                LEFT JOIN drone_space.video_shares vs
                  ON vs.video_id = v.id AND vs.shared_with_user_id = :uid
                LEFT JOIN drone_space.folder_shares fs
                  ON fs.owner_user_id = v.user_id
                  AND (fs.folder_path = v.folder_path
                       OR v.folder_path LIKE fs.folder_path || '/%')
                  AND fs.shared_with_user_id = :uid
                WHERE v.id = :vid
                  AND (
                    v.user_id = :uid
                    OR v.visibility = 'public'
                    OR vs.video_id IS NOT NULL
                    OR fs.owner_user_id IS NOT NULL
                  )
                LIMIT 1
                """
            ),
            {"vid": video_id, "uid": user_id},
        ).first()
    return row is not None


def insert_video(
    *,
    user_id: str,
    folder_path: str,
    filename: str,
    cover_filename: Optional[str],
    size_bytes: int,
    metadata: dict[str, Any],
) -> None:
    """Persist a row in drone_space.videos for a freshly-uploaded video."""

    taken_at_raw = metadata.get("taken_at")
    taken_at: Optional[datetime] = None
    if isinstance(taken_at_raw, str) and taken_at_raw:
        try:
            taken_at = datetime.fromisoformat(taken_at_raw)
        except ValueError:
            taken_at = None

    tags = metadata.get("tags") or []
    if not isinstance(tags, list):
        tags = []

    params = {
        "user_id": user_id,
        "folder_path": folder_path,
        "filename": filename,
        "cover_filename": cover_filename,
        "size_bytes": int(size_bytes),
        "location": metadata.get("location"),
        "latitude": metadata.get("latitude"),
        "longitude": metadata.get("longitude"),
        "height_m": metadata.get("height_m"),
        "tags": tags,
        "taken_at": taken_at,
        "drone_type": metadata.get("drone_type"),
        "original_filename": metadata.get("original_filename"),
    }

    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO drone_space.videos (
                    user_id, folder_path, filename, cover_filename, size_bytes,
                    location, latitude, longitude, height_m, tags,
                    taken_at, drone_type, original_filename
                ) VALUES (
                    :user_id, :folder_path, :filename, :cover_filename, :size_bytes,
                    :location, :latitude, :longitude, :height_m, :tags,
                    :taken_at, :drone_type, :original_filename
                )
                """
            ),
            params,
        )
