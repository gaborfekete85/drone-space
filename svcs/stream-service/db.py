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
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id::text AS id, filename
                FROM drone_space.videos
                WHERE user_id = :u AND folder_path = :p
                """
            ),
            {"u": user_id, "p": folder_path},
        ).mappings().all()
    return {r["filename"]: r["id"] for r in rows}


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
