"""Database connection and migration runner.

Migrations are managed by Alembic; the application calls ``run_migrations()``
on startup so the schema is always at head before any request is served.
"""

from __future__ import annotations

import logging
import os
import uuid
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


def update_video_folder(video_id: str, new_folder_path: str) -> None:
    """Move a video row to a different folder. Used by /api/videos/{id}/move."""
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "UPDATE drone_space.videos SET folder_path = :p WHERE id = :id"
            ),
            {"p": new_folder_path, "id": video_id},
        )


def delete_video_row(video_id: str) -> None:
    """Delete a video row. video_shares.video_id has ON DELETE CASCADE so
    related shares disappear automatically."""
    with get_engine().begin() as conn:
        conn.execute(
            text("DELETE FROM drone_space.videos WHERE id = :id"),
            {"id": video_id},
        )


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

    drone_id_raw = metadata.get("drone_id")
    drone_id = drone_id_raw if isinstance(drone_id_raw, str) and drone_id_raw else None

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
        "drone_id": drone_id,
        "original_filename": metadata.get("original_filename"),
    }

    with get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO drone_space.videos (
                    user_id, folder_path, filename, cover_filename, size_bytes,
                    location, latitude, longitude, height_m, tags,
                    taken_at, drone_type, drone_id, original_filename
                ) VALUES (
                    :user_id, :folder_path, :filename, :cover_filename, :size_bytes,
                    :location, :latitude, :longitude, :height_m, :tags,
                    :taken_at, :drone_type, :drone_id, :original_filename
                )
                """
            ),
            params,
        )


# ---------------------------------------------------------------------------
# User profile (extra info attached to a Clerk user_id)
# ---------------------------------------------------------------------------


def get_user_profile(user_id: str) -> Optional[dict]:
    """Return the user_profile row for `user_id` or None if not yet created."""
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT user_id, latitude, longitude, location_label,
                       location_updated_at,
                       display_name, nickname, description, country, city,
                       social_links, profile_image_filename,
                       created_at, updated_at
                FROM drone_space.user_profile
                WHERE user_id = :u
                """
            ),
            {"u": user_id},
        ).mappings().first()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Drones
# ---------------------------------------------------------------------------


_DRONE_FIELDS = (
    "id::text AS id, user_id, brand, model, drone_type, nickname, "
    "max_flight_time_min, year_acquired, notes, photo_filename, "
    "status, sale_price, sale_currency, listed_at, "
    "created_at, updated_at"
)

VALID_DRONE_TYPE = {"video", "fpv"}
VALID_DRONE_STATUS = {"OWNED", "SELLING"}


def list_drones(user_id: str) -> list[dict]:
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT {_DRONE_FIELDS}
                  FROM drone_space.drones
                 WHERE user_id = :u
                 ORDER BY created_at ASC
                """
            ),
            {"u": user_id},
        ).mappings().all()
    return [dict(r) for r in rows]


def get_drone(drone_id: str) -> Optional[dict]:
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT {_DRONE_FIELDS}
                  FROM drone_space.drones
                 WHERE id = :id
                """
            ),
            {"id": drone_id},
        ).mappings().first()
    return dict(row) if row else None


def insert_drone(
    *,
    user_id: str,
    brand: str,
    model: str,
    drone_type: str,
    nickname: Optional[str],
    max_flight_time_min: Optional[int],
    year_acquired: Optional[int],
    notes: Optional[str],
) -> dict:
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO drone_space.drones (
                    user_id, brand, model, drone_type, nickname,
                    max_flight_time_min, year_acquired, notes
                ) VALUES (
                    :u, :brand, :model, :drone_type, :nickname,
                    :max_t, :year, :notes
                )
                RETURNING {_DRONE_FIELDS}
                """
            ),
            {
                "u": user_id,
                "brand": brand,
                "model": model,
                "drone_type": drone_type,
                "nickname": nickname,
                "max_t": max_flight_time_min,
                "year": year_acquired,
                "notes": notes,
            },
        ).mappings().first()
    assert row is not None
    return dict(row)


def update_drone(
    drone_id: str,
    *,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    drone_type: Optional[str] = None,
    nickname: Optional[str] = None,
    max_flight_time_min: Optional[int] = None,
    year_acquired: Optional[int] = None,
    notes: Optional[str] = None,
    photo_filename: Optional[str] = None,
    clear_nickname: bool = False,
    clear_max_t: bool = False,
    clear_year: bool = False,
    clear_notes: bool = False,
    clear_photo: bool = False,
) -> Optional[dict]:
    """Patch any subset of fields. None means "leave alone"; the explicit
    `clear_*` flags allow setting nullable columns back to NULL."""
    sets: list[str] = []
    params: dict[str, Any] = {"id": drone_id}
    if brand is not None:
        sets.append("brand = :brand")
        params["brand"] = brand
    if model is not None:
        sets.append("model = :model")
        params["model"] = model
    if drone_type is not None:
        sets.append("drone_type = :drone_type")
        params["drone_type"] = drone_type
    if nickname is not None or clear_nickname:
        sets.append("nickname = :nickname")
        params["nickname"] = None if clear_nickname else nickname
    if max_flight_time_min is not None or clear_max_t:
        sets.append("max_flight_time_min = :max_t")
        params["max_t"] = None if clear_max_t else max_flight_time_min
    if year_acquired is not None or clear_year:
        sets.append("year_acquired = :year")
        params["year"] = None if clear_year else year_acquired
    if notes is not None or clear_notes:
        sets.append("notes = :notes")
        params["notes"] = None if clear_notes else notes
    if photo_filename is not None or clear_photo:
        sets.append("photo_filename = :photo")
        params["photo"] = None if clear_photo else photo_filename
    if not sets:
        return get_drone(drone_id)
    sets.append("updated_at = now()")
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE drone_space.drones
                   SET {", ".join(sets)}
                 WHERE id = :id
             RETURNING {_DRONE_FIELDS}
                """
            ),
            params,
        ).mappings().first()
    return dict(row) if row else None


def list_drone_for_sale(
    drone_id: str, *, sale_price: float, sale_currency: str
) -> Optional[dict]:
    """Mark a drone as SELLING. Stamps `listed_at = now()` so the marketplace
    can sort newest-first. Updating an already-listed drone refreshes both
    the price/currency AND the timestamp — re-listing bubbles it back to
    the top, which matches what users expect."""
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE drone_space.drones
                   SET status = 'SELLING',
                       sale_price = :price,
                       sale_currency = :currency,
                       listed_at = now(),
                       updated_at = now()
                 WHERE id = :id
             RETURNING {_DRONE_FIELDS}
                """
            ),
            {"id": drone_id, "price": sale_price, "currency": sale_currency},
        ).mappings().first()
    return dict(row) if row else None


def unlist_drone(drone_id: str) -> Optional[dict]:
    """Take a drone off the marketplace. Wipes price/currency/listed_at so
    a stale listing doesn't reappear if the user later flips status by hand."""
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE drone_space.drones
                   SET status = 'OWNED',
                       sale_price = NULL,
                       sale_currency = NULL,
                       listed_at = NULL,
                       updated_at = now()
                 WHERE id = :id
             RETURNING {_DRONE_FIELDS}
                """
            ),
            {"id": drone_id},
        ).mappings().first()
    return dict(row) if row else None


def list_marketplace() -> list[dict]:
    """All drones currently listed for sale, newest-first. Anyone signed in
    can browse the marketplace — no per-user filter."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT {_DRONE_FIELDS}
                  FROM drone_space.drones
                 WHERE status = 'SELLING'
                 ORDER BY listed_at DESC
                """
            ),
        ).mappings().all()
    return [dict(r) for r in rows]


def delete_drone(drone_id: str) -> bool:
    with get_engine().begin() as conn:
        res = conn.execute(
            text("DELETE FROM drone_space.drones WHERE id = :id"),
            {"id": drone_id},
        )
    return res.rowcount > 0


def user_owns_drone(user_id: str, drone_id: str) -> bool:
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                "SELECT 1 FROM drone_space.drones WHERE id = :id AND user_id = :u"
            ),
            {"id": drone_id, "u": user_id},
        ).first()
    return row is not None


def list_nearby_users(user_id: str, radius_km: float) -> list[dict]:
    """Users within `radius_km` of the caller, sorted by distance ascending.

    Returns rows with `user_id`, `latitude`, `longitude`, `location_label`,
    `distance_km`. Excludes the caller. Returns [] if the caller has no
    coordinates yet — there's no anchor to compute distance from.

    The `earth_box(... ) @> ll_to_earth(...)` prefilter uses the GIST index
    on `ll_to_earth(latitude, longitude)`; the outer `earth_distance(...) <
    radius` trims the bbox corners. earthdistance returns metres.
    """
    radius_m = max(0.0, float(radius_km)) * 1000.0
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                WITH me AS (
                    SELECT latitude, longitude
                      FROM drone_space.user_profile
                     WHERE user_id = :u
                       AND latitude IS NOT NULL
                       AND longitude IS NOT NULL
                )
                SELECT p.user_id,
                       p.latitude,
                       p.longitude,
                       p.location_label,
                       earth_distance(
                           ll_to_earth(me.latitude, me.longitude),
                           ll_to_earth(p.latitude, p.longitude)
                       ) / 1000.0 AS distance_km
                  FROM drone_space.user_profile p, me
                 WHERE p.user_id <> :u
                   AND p.latitude IS NOT NULL
                   AND p.longitude IS NOT NULL
                   AND earth_box(ll_to_earth(me.latitude, me.longitude), :rm)
                       @> ll_to_earth(p.latitude, p.longitude)
                   AND earth_distance(
                           ll_to_earth(me.latitude, me.longitude),
                           ll_to_earth(p.latitude, p.longitude)
                       ) <= :rm
                 ORDER BY distance_km ASC
                """
            ),
            {"u": user_id, "rm": radius_m},
        ).mappings().all()
    return [dict(r) for r in rows]


def upsert_user_personal_info(
    user_id: str,
    *,
    display_name: Optional[str],
    nickname: Optional[str],
    description: Optional[str],
    country: Optional[str],
    city: Optional[str],
    social_links: dict,
) -> dict:
    """Insert or update the editable personal info on a user_profile row.

    Location columns (latitude/longitude/location_label/location_updated_at)
    are deliberately left out — they're owned by `upsert_user_location`,
    which the location refresh hook calls hourly. This keeps the two flows
    independent: the user editing their bio shouldn't wipe out the chip in
    the header, and a location refresh shouldn't undo a freshly-saved bio.

    `social_links` is stored as JSONB; pass an already-cleaned dict (no
    nones; lowercase keys).
    """
    import json

    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO drone_space.user_profile (
                    user_id, display_name, nickname, description,
                    country, city, social_links, updated_at
                ) VALUES (
                    :u, :dn, :nick, :desc, :country, :city,
                    cast(:social as jsonb), now()
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    nickname = EXCLUDED.nickname,
                    description = EXCLUDED.description,
                    country = EXCLUDED.country,
                    city = EXCLUDED.city,
                    social_links = EXCLUDED.social_links,
                    updated_at = now()
                RETURNING user_id, latitude, longitude, location_label,
                          location_updated_at,
                          display_name, nickname, description, country, city,
                          social_links, profile_image_filename,
                          created_at, updated_at
                """
            ),
            {
                "u": user_id,
                "dn": display_name,
                "nick": nickname,
                "desc": description,
                "country": country,
                "city": city,
                "social": json.dumps(social_links or {}),
            },
        ).mappings().first()
    assert row is not None
    return dict(row)


def set_profile_photo(user_id: str, filename: Optional[str]) -> Optional[dict]:
    """Set or clear `profile_image_filename` for the user. Inserts a new row
    (with no other fields populated) if none exists yet so that uploading an
    avatar before any other personal info works."""
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO drone_space.user_profile (user_id, profile_image_filename)
                VALUES (:u, :f)
                ON CONFLICT (user_id) DO UPDATE SET
                    profile_image_filename = EXCLUDED.profile_image_filename,
                    updated_at = now()
                RETURNING user_id, latitude, longitude, location_label,
                          location_updated_at,
                          display_name, nickname, description, country, city,
                          social_links, profile_image_filename,
                          created_at, updated_at
                """
            ),
            {"u": user_id, "f": filename},
        ).mappings().first()
    return dict(row) if row else None


def upsert_user_location(
    user_id: str,
    latitude: Optional[float],
    longitude: Optional[float],
    location_label: Optional[str],
) -> dict:
    """Insert or update the user's location. Returns the resulting row.

    Called from the dashboard on first paint and on the hourly refresh tick.
    Coordinates may be NULL (e.g. when the browser denied geolocation but we
    still want a profile row to attach future fields to).
    """
    with get_engine().begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO drone_space.user_profile (
                    user_id, latitude, longitude, location_label,
                    location_updated_at, updated_at
                ) VALUES (
                    :u, :lat, :lng, :label, now(), now()
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    location_label = EXCLUDED.location_label,
                    location_updated_at = now(),
                    updated_at = now()
                RETURNING user_id, latitude, longitude, location_label,
                          location_updated_at, created_at, updated_at
                """
            ),
            {
                "u": user_id,
                "lat": latitude,
                "lng": longitude,
                "label": location_label,
            },
        ).mappings().first()
    assert row is not None
    return dict(row)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


_MESSAGE_FIELDS = (
    "id::text AS id, thread_id::text AS thread_id, "
    "sender_user_id, recipient_user_id, subject, body, "
    "created_at, read_at"
)


def insert_message(
    *,
    sender_user_id: str,
    recipient_user_id: str,
    subject: str,
    body: str,
    parent_id: Optional[str],
) -> dict:
    """Create a new message.

    If `parent_id` is provided it must exist and the sender must be a
    participant of that thread; the new message inherits the parent's
    thread_id (so the whole conversation lives under one root).

    For a brand-new thread, `thread_id` is set to the message's own id via a
    second UPDATE — we don't know the generated UUID until after INSERT.
    """
    with get_engine().begin() as conn:
        if parent_id is not None:
            parent = conn.execute(
                text(
                    """
                    SELECT thread_id::text AS thread_id,
                           sender_user_id, recipient_user_id
                      FROM drone_space.messages
                     WHERE id = :pid
                    """
                ),
                {"pid": parent_id},
            ).mappings().first()
            if parent is None:
                raise ValueError("parent message not found")
            participants = {parent["sender_user_id"], parent["recipient_user_id"]}
            if sender_user_id not in participants:
                raise PermissionError("not a participant of this thread")
            if recipient_user_id not in participants:
                raise ValueError("recipient must be the other participant")
            thread_id = parent["thread_id"]
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO drone_space.messages (
                        thread_id, sender_user_id, recipient_user_id, subject, body
                    ) VALUES (
                        :tid, :s, :r, :subj, :body
                    )
                    RETURNING {_MESSAGE_FIELDS}
                    """
                ),
                {
                    "tid": thread_id,
                    "s": sender_user_id,
                    "r": recipient_user_id,
                    "subj": subject,
                    "body": body,
                },
            ).mappings().first()
        else:
            # Generate the UUID in Python so we can use the same value for
            # both `id` and `thread_id` in one INSERT — a CTE-based two-step
            # doesn't work here because under MVCC the UPDATE doesn't see
            # rows inserted by its own statement's CTE.
            new_id = str(uuid.uuid4())
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO drone_space.messages (
                        id, thread_id, sender_user_id, recipient_user_id,
                        subject, body
                    ) VALUES (
                        :id, :id, :s, :r, :subj, :body
                    )
                    RETURNING {_MESSAGE_FIELDS}
                    """
                ),
                {
                    "id": new_id,
                    "s": sender_user_id,
                    "r": recipient_user_id,
                    "subj": subject,
                    "body": body,
                },
            ).mappings().first()
    assert row is not None
    return dict(row)


def list_threads_for_user(user_id: str) -> list[dict]:
    """One row per thread the user participates in. Returns the latest
    message in each thread plus the user's unread count for that thread.
    Sorted by latest activity first."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                """
                WITH mine AS (
                    SELECT *
                      FROM drone_space.messages
                     WHERE sender_user_id = :u OR recipient_user_id = :u
                ),
                latest AS (
                    SELECT DISTINCT ON (thread_id) *
                      FROM mine
                     ORDER BY thread_id, created_at DESC
                )
                SELECT
                    l.thread_id::text AS thread_id,
                    l.id::text AS last_message_id,
                    l.sender_user_id AS last_sender_user_id,
                    l.recipient_user_id AS last_recipient_user_id,
                    l.subject,
                    l.body AS last_body,
                    l.created_at AS last_at,
                    l.read_at AS last_read_at,
                    (
                      SELECT count(*)
                        FROM mine
                       WHERE mine.thread_id = l.thread_id
                         AND mine.recipient_user_id = :u
                         AND mine.read_at IS NULL
                    ) AS unread_count,
                    (
                      SELECT count(DISTINCT user_id)
                        FROM (
                          SELECT sender_user_id AS user_id FROM mine WHERE thread_id = l.thread_id
                          UNION
                          SELECT recipient_user_id AS user_id FROM mine WHERE thread_id = l.thread_id
                        ) AS u
                    ) AS participant_count,
                    (
                      CASE
                        WHEN l.sender_user_id = :u THEN l.recipient_user_id
                        ELSE l.sender_user_id
                      END
                    ) AS counterparty_user_id
                FROM latest l
                ORDER BY l.created_at DESC
                """
            ),
            {"u": user_id},
        ).mappings().all()
    return [dict(r) for r in rows]


def list_thread_messages(thread_id: str, user_id: str) -> Optional[list[dict]]:
    """All messages in a thread, oldest first. Returns None if the user
    isn't a participant — caller should translate to 404."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT {_MESSAGE_FIELDS}
                  FROM drone_space.messages
                 WHERE thread_id = :tid
                 ORDER BY created_at ASC
                """
            ),
            {"tid": thread_id},
        ).mappings().all()
    if not rows:
        return None
    participants: set[str] = set()
    for r in rows:
        participants.add(r["sender_user_id"])
        participants.add(r["recipient_user_id"])
    if user_id not in participants:
        return None
    return [dict(r) for r in rows]


def mark_thread_read(thread_id: str, user_id: str) -> int:
    """Mark every message in `thread_id` addressed to `user_id` as read.
    Returns the row count actually updated."""
    with get_engine().begin() as conn:
        res = conn.execute(
            text(
                """
                UPDATE drone_space.messages
                   SET read_at = now()
                 WHERE thread_id = :tid
                   AND recipient_user_id = :u
                   AND read_at IS NULL
                """
            ),
            {"tid": thread_id, "u": user_id},
        )
    return res.rowcount


def mark_message_read(message_id: str, user_id: str) -> bool:
    """Mark a single message read. Only the recipient can do this.
    Returns True if a row was actually updated (no-op for already-read or
    not-recipient)."""
    with get_engine().begin() as conn:
        res = conn.execute(
            text(
                """
                UPDATE drone_space.messages
                   SET read_at = now()
                 WHERE id = :id
                   AND recipient_user_id = :u
                   AND read_at IS NULL
                """
            ),
            {"id": message_id, "u": user_id},
        )
    return res.rowcount > 0


def list_unread_for_user(user_id: str, limit: int = 10) -> list[dict]:
    """Most-recent unread messages addressed to `user_id`, newest first."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT {_MESSAGE_FIELDS}
                  FROM drone_space.messages
                 WHERE recipient_user_id = :u
                   AND read_at IS NULL
                 ORDER BY created_at DESC
                 LIMIT :lim
                """
            ),
            {"u": user_id, "lim": int(limit)},
        ).mappings().all()
    return [dict(r) for r in rows]


def count_unread_for_user(user_id: str) -> int:
    with get_engine().begin() as conn:
        n = conn.execute(
            text(
                """
                SELECT count(*) FROM drone_space.messages
                 WHERE recipient_user_id = :u AND read_at IS NULL
                """
            ),
            {"u": user_id},
        ).scalar()
    return int(n or 0)
