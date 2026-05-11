"""DroneSpace backend — pluggable storage video library.

`app_data/videos/<user_id>/...` is the always-on metadata index in both
storage modes: folders are real directories, and every uploaded video is
accompanied by `<name>_cover.jpg` and `<name>.meta.json` sidecars. The
`STORAGE` env var only decides where the video *bytes* go:

  STORAGE=s3      (default)  Folder dirs + cover + meta in app_data.
                             Video bytes streamed to S3 only.
                             AWS_S3_BUCKET must be set.

  STORAGE=volume             Folder dirs + cover + meta + video bytes
                             all live in app_data. S3 is never called.

Listing, cover and meta are always served from app_data — much faster than
S3 GetObject and survives restart-time S3 latency. Only the `.mp4` stream
is fetched from S3 in s3 mode (via a 302 to a presigned URL).
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

import cf_sign
import s3
from db import (
    count_unread_for_user,
    delete_drone,
    delete_video_row,
    get_drone,
    get_user_profile,
    get_video,
    insert_drone,
    insert_message,
    insert_video,
    list_drone_for_sale,
    list_drones,
    list_folder_shares,
    list_marketplace,
    list_nearby_users,
    list_shared_with,
    list_thread_messages,
    list_threads_for_user,
    list_unread_for_user,
    list_video_meta,
    list_video_shares,
    mark_message_read,
    mark_thread_read,
    run_migrations,
    set_profile_photo,
    set_video_visibility,
    share_folder,
    share_video,
    unlist_drone,
    unshare_folder,
    unshare_video,
    update_drone,
    update_video_folder,
    upsert_user_location,
    upsert_user_personal_info,
    user_can_access_video,
    user_owns_drone,
)

log = logging.getLogger("dronespace.backend")

STORAGE = os.environ.get("STORAGE", "s3").strip().lower()
if STORAGE not in {"s3", "volume"}:
    raise RuntimeError(
        f"invalid STORAGE={STORAGE!r}; must be 's3' or 'volume'"
    )
if STORAGE == "s3" and not s3.S3_BUCKET:
    raise RuntimeError(
        "STORAGE=s3 requires AWS_S3_BUCKET to be set"
    )

# How streaming URLs are signed when STORAGE=s3:
#   "s3"         — direct S3 presigned GET (no CDN, no caching).
#   "cloudfront" — CloudFront signed URL via the /stream/* cache behavior.
# Volume mode ignores this — the URL points at /api/stream regardless.
STREAM_URL_STRATEGY = os.environ.get("STREAM_URL_STRATEGY", "s3").strip().lower()
if STREAM_URL_STRATEGY not in {"s3", "cloudfront"}:
    raise RuntimeError(
        f"invalid STREAM_URL_STRATEGY={STREAM_URL_STRATEGY!r}; must be 's3' or 'cloudfront'"
    )
if STREAM_URL_STRATEGY == "cloudfront" and not cf_sign.is_configured():
    raise RuntimeError(
        "STREAM_URL_STRATEGY=cloudfront requires CLOUDFRONT_DOMAIN, "
        "CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_PRIVATE_KEY_B64 to be set"
    )


def _sign_video_url(
    user_id: str, folder_path: str, filename: str, expires: int
) -> Optional[str]:
    """Generate a temporary playback URL for a single video, using whichever
    strategy is selected at startup. Caller is responsible for access checks."""
    s3_key = s3.video_key(user_id, folder_path, filename)
    if STREAM_URL_STRATEGY == "cloudfront":
        return cf_sign.sign_video_url(s3_key, expires_in=expires)
    return s3.presign_get_url(s3_key, expires=expires)

APP_DATA_ROOT = Path(
    os.environ.get(
        "APP_DATA_ROOT",
        "/Users/gaborfekete/my-projects/drone/app_data",
    )
).resolve()
VIDEOS_ROOT = APP_DATA_ROOT / "videos"
USER_DATA_ROOT = APP_DATA_ROOT / "user_data"
# app_data is the metadata index in both modes — always create it.
VIDEOS_ROOT.mkdir(parents=True, exist_ok=True)
USER_DATA_ROOT.mkdir(parents=True, exist_ok=True)

DRONE_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _drones_dir(user_id: str) -> Path:
    _validate_user_id(user_id)
    p = USER_DATA_ROOT / user_id / "drones"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _user_data_dir(user_id: str) -> Path:
    _validate_user_id(user_id)
    p = USER_DATA_ROOT / user_id
    p.mkdir(parents=True, exist_ok=True)
    return p


PROFILE_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

VIDEO_EXTENSIONS = {".mp4"}
META_SUFFIX = ".meta.json"
COVER_SUFFIX = "_cover.jpg"


def _cover_for(video_path: Path) -> Path:
    return video_path.with_name(f"{video_path.stem}{COVER_SUFFIX}")

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Bring the schema to head before serving the first request.
    run_migrations()
    s3.log_status()
    cf_sign.log_status()
    log.info("stream URL strategy: %s", STREAM_URL_STRATEGY)
    yield


app = FastAPI(title="DroneSpace Backend", version="0.1.0", lifespan=lifespan)


def _validate_user_id(user_id: str) -> None:
    if not user_id or "/" in user_id or "\\" in user_id or user_id in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid user_id")


def _safe_user_root(user_id: str) -> Path:
    """Volume-mode only: ensure & return the user's videos directory."""
    _validate_user_id(user_id)
    root = VIDEOS_ROOT / user_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve_inside_user(user_id: str, rel_path: str) -> Path:
    """Volume-mode only: filesystem-resolve a path inside the user root and
    refuse anything that escapes it."""
    user_root = _safe_user_root(user_id).resolve()
    rel = (rel_path or "").strip().strip("/")
    target = (user_root / rel).resolve() if rel else user_root
    if user_root != target and user_root not in target.parents:
        raise HTTPException(status_code=400, detail="path escapes user root")
    return target


def _safe_relative_path(rel_path: str) -> str:
    """Backend-agnostic path normalization. Rejects '.', '..', and backslashes
    so an s3-mode caller can't break out of the user's prefix or build
    surprising keys."""
    parts = [p for p in (rel_path or "").strip().strip("/").split("/") if p]
    for p in parts:
        if p in {".", ".."} or "\\" in p:
            raise HTTPException(status_code=400, detail="invalid path")
    return "/".join(parts)


def _is_video(p: Path) -> bool:
    return p.suffix.lower() in VIDEO_EXTENSIONS


def _read_metadata(video_path: Path) -> dict:
    meta_path = video_path.with_name(video_path.name + META_SUFFIX)
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text())
    except Exception:
        return {}


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "storage": STORAGE,
        "videos_root": str(VIDEOS_ROOT) if STORAGE == "volume" else None,
        "s3_bucket": s3.S3_BUCKET if STORAGE == "s3" else None,
    }


@app.get("/api/folders")
def list_folder(
    user_id: str = Query(..., min_length=1),
    path: str = Query(""),
) -> dict:
    _validate_user_id(user_id)
    folder_path_norm = _safe_relative_path(path)
    parts = folder_path_norm.split("/") if folder_path_norm else []

    target = _resolve_inside_user(user_id, path)
    if not target.exists():
        target.mkdir(parents=True, exist_ok=True)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="not a folder")

    # A video is anything we recognise as either:
    #   - a .mp4 file directly (volume mode, or s3 mode pre-migration), OR
    #   - a .meta.json sidecar whose target name we can derive (s3 mode —
    #     bytes live in S3, only the sidecar is on disk).
    video_names: dict[str, Optional[Path]] = {}  # name -> .mp4 Path or None
    folders: list[dict] = []
    sidecar_names: set[str] = set()
    cover_names: set[str] = set()
    for entry in sorted(target.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            folders.append({"name": entry.name})
            continue
        if entry.is_file():
            if entry.name.endswith(META_SUFFIX):
                sidecar_names.add(entry.name[: -len(META_SUFFIX)])
            elif entry.name.endswith(COVER_SUFFIX):
                cover_names.add(entry.name)
            elif _is_video(entry):
                video_names[entry.name] = entry

    for name in sidecar_names:
        if name not in video_names:
            video_names[name] = None  # sidecar-only entry (s3 mode)

    meta_by_filename = list_video_meta(user_id, folder_path_norm)

    videos: list[dict] = []
    for name in sorted(video_names, key=str.lower):
        video_path = video_names[name]
        meta_dict = _read_metadata(target / name)
        cover_filename = (
            f"{Path(name).stem}{COVER_SUFFIX}"
            if f"{Path(name).stem}{COVER_SUFFIX}" in cover_names
            else None
        )

        if video_path is not None:
            stat = video_path.stat()
            size = stat.st_size
            uploaded_at = datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat()
        else:
            size = int(meta_dict.get("size_bytes") or 0)
            uploaded_at = meta_dict.get("uploaded_at")

        row_meta = meta_by_filename.get(name) or {}
        videos.append(
            {
                "id": row_meta.get("id"),
                "visibility": row_meta.get("visibility", "private"),
                "name": name,
                "size": size,
                "uploaded_at": uploaded_at,
                "metadata": meta_dict,
                "cover_filename": cover_filename,
            }
        )

    return {
        "user_id": user_id,
        "path": folder_path_norm,
        "parts": parts,
        "folders": folders,
        "videos": videos,
    }


class CreateFolderBody(BaseModel):
    user_id: str
    path: str = ""
    name: str


@app.post("/api/folders")
def create_folder(body: CreateFolderBody) -> dict:
    name = body.name.strip()
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid folder name")
    _validate_user_id(body.user_id)
    parent_norm = _safe_relative_path(body.path)
    rel = f"{parent_norm}/{name}" if parent_norm else name

    parent = _resolve_inside_user(body.user_id, body.path)
    parent.mkdir(parents=True, exist_ok=True)
    new_folder = parent / name
    if new_folder.exists():
        raise HTTPException(status_code=409, detail="folder already exists")
    new_folder.mkdir(parents=False, exist_ok=False)

    if STORAGE == "s3":
        # Best-effort marker so the folder shows up in the AWS console too.
        # Failure here doesn't roll back the local mkdir — listing reads from
        # app_data, not S3.
        s3.create_folder_marker(body.user_id, rel)

    return {"ok": True, "path": rel}


class UploadInitBody(BaseModel):
    user_id: str
    path: str = ""
    filename: str
    content_type: Optional[str] = None
    drone_id: Optional[str] = None


@app.post("/api/upload/init")
def upload_init(body: UploadInitBody) -> dict:
    """Reserve a filename in the target folder and return a presigned PUT URL
    so the browser can upload the video bytes directly to S3.

    Why this endpoint exists: pushing multi-GB videos through Starlette
    means every byte gets buffered to /tmp before being re-streamed to S3.
    On 4 GB files that overflows the spooled temp file, doubles wall-clock,
    and exposes the upload to every proxy timeout in the chain. With a
    presigned PUT the browser uploads to S3 directly and we never see the
    bytes — the backend's only job is metadata.
    """
    if STORAGE != "s3":
        raise HTTPException(
            status_code=501,
            detail="upload/init only available in s3 mode — use /api/upload",
        )
    _validate_user_id(body.user_id)
    folder_path_norm = _safe_relative_path(body.path)

    raw_name = Path(body.filename).name
    if not raw_name:
        raise HTTPException(status_code=400, detail="missing filename")
    if Path(raw_name).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported file type (allowed: {sorted(VIDEO_EXTENSIONS)})",
        )

    if body.drone_id:
        if not user_owns_drone(body.user_id, body.drone_id):
            raise HTTPException(status_code=400, detail="invalid drone_id")

    target_dir = _resolve_inside_user(body.user_id, body.path)
    target_dir.mkdir(parents=True, exist_ok=True)

    final_name = raw_name
    if _name_taken(target_dir, final_name):
        stem, suffix = Path(raw_name).stem, Path(raw_name).suffix
        i = 1
        while _name_taken(target_dir, f"{stem}-{i}{suffix}"):
            i += 1
        final_name = f"{stem}-{i}{suffix}"

    presigned = s3.presign_put_url(
        body.user_id, folder_path_norm, final_name, expires=3600
    )
    if not presigned:
        raise HTTPException(status_code=502, detail="s3: failed to presign PUT")

    return {
        "final_name": final_name,
        "key": s3.video_key(body.user_id, folder_path_norm, final_name),
        "presigned_url": presigned,
        "expires_in": 3600,
    }


@app.post("/api/upload/finalize")
async def upload_finalize(
    user_id: str = Form(...),
    path: str = Form(""),
    final_name: str = Form(...),
    metadata: str = Form("{}"),
    cover: Optional[UploadFile] = File(None),
) -> dict:
    """Run after a successful presigned PUT. Verifies the .mp4 actually
    landed in S3, writes the local sidecars (cover + meta.json), and
    inserts the DB row. Idempotent only on the metadata side — calling
    this twice for the same `final_name` will fail the second insert on
    the unique (user_id, folder_path, filename) constraint."""
    if STORAGE != "s3":
        raise HTTPException(
            status_code=501,
            detail="upload/finalize only available in s3 mode",
        )
    _validate_user_id(user_id)
    folder_path_norm = _safe_relative_path(path)
    raw_name = Path(final_name).name
    if Path(raw_name).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="unsupported file type")
    if cover is not None and cover.filename:
        cover_ext = Path(cover.filename).suffix.lower()
        if cover_ext not in {".jpg", ".jpeg"}:
            raise HTTPException(
                status_code=415, detail="cover must be a .jpg / .jpeg image"
            )

    # The browser may have failed mid-upload (closed tab, killed wifi);
    # don't insert a DB row that points at bytes that aren't there.
    head = s3.head_object(user_id, folder_path_norm, raw_name)
    if head is None:
        raise HTTPException(
            status_code=409,
            detail="s3 object not found — upload may have failed before finishing",
        )
    bytes_written = int(head["size"])

    try:
        meta_payload = json.loads(metadata) if metadata else {}
        if not isinstance(meta_payload, dict):
            meta_payload = {}
    except json.JSONDecodeError:
        meta_payload = {}

    drone_id_raw = meta_payload.get("drone_id")
    if isinstance(drone_id_raw, str) and drone_id_raw:
        if not user_owns_drone(user_id, drone_id_raw):
            # Bytes are already in S3 — nuke the orphan rather than leaving
            # a dangling object the user can never reach via the app.
            s3.delete_video(user_id, folder_path_norm, raw_name)
            raise HTTPException(status_code=400, detail="invalid drone_id")
        drone_row = get_drone(drone_id_raw)
        if drone_row is not None:
            meta_payload["drone_type"] = drone_row["drone_type"]
    else:
        meta_payload["drone_id"] = None

    target_dir = _resolve_inside_user(user_id, path)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / raw_name
    cover_filename: Optional[str] = None

    meta_payload.setdefault("uploaded_at", datetime.now(timezone.utc).isoformat())
    meta_payload["original_filename"] = raw_name
    meta_payload["size_bytes"] = bytes_written

    if cover is not None and cover.filename:
        cover_path = _cover_for(target_file)
        with cover_path.open("wb") as out:
            while True:
                chunk = await cover.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        cover_filename = cover_path.name

    meta_path = target_file.with_name(target_file.name + META_SUFFIX)
    meta_path.write_text(json.dumps(meta_payload, indent=2))

    insert_video(
        user_id=user_id,
        folder_path=folder_path_norm,
        filename=raw_name,
        cover_filename=cover_filename,
        size_bytes=bytes_written,
        metadata=meta_payload,
    )

    rel = f"{folder_path_norm}/{raw_name}" if folder_path_norm else raw_name
    return {
        "ok": True,
        "name": raw_name,
        "path": rel,
        "size": bytes_written,
        "metadata": meta_payload,
        "cover_filename": cover_filename,
        "storage": STORAGE,
    }


@app.post("/api/upload")
async def upload_video(
    user_id: str = Form(...),
    path: str = Form(""),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    cover: Optional[UploadFile] = File(None),
) -> dict:
    _validate_user_id(user_id)
    folder_path_norm = _safe_relative_path(path)

    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    raw_name = Path(file.filename).name
    if Path(raw_name).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported file type (allowed: {sorted(VIDEO_EXTENSIONS)})",
        )
    if cover is not None and cover.filename:
        cover_ext = Path(cover.filename).suffix.lower()
        if cover_ext not in {".jpg", ".jpeg"}:
            raise HTTPException(
                status_code=415,
                detail="cover must be a .jpg / .jpeg image",
            )

    try:
        meta_payload = json.loads(metadata) if metadata else {}
        if not isinstance(meta_payload, dict):
            meta_payload = {}
    except json.JSONDecodeError:
        meta_payload = {}

    # If the client picked a drone, validate ownership before we write any
    # bytes — much cheaper to fail here than after an S3 upload. The drone
    # row is the authoritative source for drone_type; we copy it onto the
    # video for fast filtering without a join.
    drone_id_raw = meta_payload.get("drone_id")
    if isinstance(drone_id_raw, str) and drone_id_raw:
        if not user_owns_drone(user_id, drone_id_raw):
            raise HTTPException(status_code=400, detail="invalid drone_id")
        drone_row = get_drone(drone_id_raw)
        if drone_row is not None:
            meta_payload["drone_type"] = drone_row["drone_type"]
    else:
        meta_payload["drone_id"] = None

    target_dir = _resolve_inside_user(user_id, path)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Dedupe filename against everything we already track in app_data: an
    # existing .mp4 OR an existing .meta.json sidecar (s3 mode case where
    # bytes live in S3) both count as taken.
    final_name = raw_name
    if _name_taken(target_dir, final_name):
        stem, suffix = Path(raw_name).stem, Path(raw_name).suffix
        i = 1
        while _name_taken(target_dir, f"{stem}-{i}{suffix}"):
            i += 1
        final_name = f"{stem}-{i}{suffix}"

    target_file = target_dir / final_name
    cover_filename: Optional[str] = None

    if STORAGE == "s3":
        # Capture size before handing off — boto3.upload_fileobj closes the
        # underlying spooled file once it's done, so we can't introspect it
        # afterwards. Starlette populates `file.size` from Content-Length.
        bytes_written = int(file.size or 0)
        # Stream the upload body straight into S3 — boto3 is sync so we hand
        # over the SpooledTemporaryFile under UploadFile.
        await file.seek(0)
        if not s3.upload_fileobj(
            user_id, folder_path_norm, final_name, file.file,
            content_type=file.content_type,
        ):
            raise HTTPException(status_code=502, detail="s3: video upload failed")
    else:
        bytes_written = 0
        with target_file.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                bytes_written += len(chunk)

    meta_payload.setdefault("uploaded_at", datetime.now(timezone.utc).isoformat())
    meta_payload["original_filename"] = raw_name
    meta_payload["size_bytes"] = bytes_written

    # Cover + meta sidecars always live in app_data — both modes.
    if cover is not None and cover.filename:
        cover_path = _cover_for(target_file)
        with cover_path.open("wb") as out:
            while True:
                chunk = await cover.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        cover_filename = cover_path.name

    meta_path = target_file.with_name(target_file.name + META_SUFFIX)
    meta_path.write_text(json.dumps(meta_payload, indent=2))

    insert_video(
        user_id=user_id,
        folder_path=folder_path_norm,
        filename=final_name,
        cover_filename=cover_filename,
        size_bytes=bytes_written,
        metadata=meta_payload,
    )

    rel = f"{folder_path_norm}/{final_name}" if folder_path_norm else final_name
    return {
        "ok": True,
        "name": final_name,
        "path": rel,
        "size": bytes_written,
        "metadata": meta_payload,
        "cover_filename": cover_filename,
        "storage": STORAGE,
    }


def _name_taken(target_dir: Path, name: str) -> bool:
    """A video name is taken if either its .mp4 OR its sidecar exists."""
    return (target_dir / name).exists() or (
        target_dir / f"{name}{META_SUFFIX}"
    ).exists()


@app.get("/api/cover")
def get_cover(
    user_id: str = Query(...),
    path: str = Query(...),
):
    """Always served from app_data — same in both storage modes. Cover bytes
    are small and frequently re-fetched; serving locally is much faster than
    a presigned-S3 round-trip and keeps thumbnails working when S3 is slow."""
    _validate_user_id(user_id)
    rel = _safe_relative_path(path)
    if not rel.endswith(COVER_SUFFIX):
        raise HTTPException(status_code=404, detail="cover not found")

    target = _resolve_inside_user(user_id, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="cover not found")
    return FileResponse(target, media_type="image/jpeg")


@app.get("/api/stream")
def stream_video(
    user_id: str = Query(...),
    path: str = Query(...),
):
    _validate_user_id(user_id)
    rel = _safe_relative_path(path)
    if Path(rel).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=404, detail="video not found")

    if STORAGE == "s3":
        folder, _, filename = rel.rpartition("/")
        url = _sign_video_url(user_id, folder, filename, expires=900)
        if not url:
            raise HTTPException(status_code=404, detail="video not found")
        return RedirectResponse(url, status_code=302)

    target = _resolve_inside_user(user_id, path)
    if not target.exists() or not target.is_file() or not _is_video(target):
        raise HTTPException(status_code=404, detail="video not found")
    return FileResponse(target, media_type="video/mp4", filename=target.name)


@app.get("/api/check_access")
def check_access(
    video_id: str = Query(..., min_length=1),
    user_id: str = Query("", description="Logged-in user id; empty == not logged in"),
    expires: int = Query(900, ge=60, le=3600),
) -> dict:
    """Authorize playback for a video and return a URL the client can stream.

    Access policy: the caller must be the owner, OR the video must be public,
    OR the caller must have an explicit video-share or a folder-share that
    cascades to the video.

    s3 mode → signed URL chosen by STREAM_URL_STRATEGY (s3 presign or
              CloudFront signed URL via /stream/*).
    volume mode → URL pointing at /api/stream (same host, served by us).
    """
    if not user_id.strip():
        raise HTTPException(status_code=403, detail="forbidden")

    video = get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="video not found")

    if not user_can_access_video(user_id.strip(), video_id):
        raise HTTPException(status_code=403, detail="forbidden")

    if STORAGE == "s3":
        url = _sign_video_url(
            video["user_id"],
            video["folder_path"],
            video["filename"],
            expires=expires,
        )
        if not url:
            raise HTTPException(
                status_code=502,
                detail="failed to sign URL — object missing or signing key issue",
            )
    else:
        rel = "/".join(
            p for p in [video["folder_path"], video["filename"]] if p
        )
        url = (
            f"/api/stream?user_id={video['user_id']}"
            f"&path={rel}"
        )

    return {
        "video_id": video["id"],
        "url": url,
        "expires_in": expires,
    }


# The HLS test asset lives under one specific user's prefix (uploaded
# during the m3u8 plumbing). The /api/test_m3u8 endpoint always points
# at it regardless of which user is logged in — the page is a CDN
# playback demo, not a per-user feature.
TEST_M3U8_USER = "user_3DDgqxv7HBmwt3pFHt08hg1hqA5"
TEST_M3U8_FOLDER = "Dani"
TEST_M3U8_FILENAME = "Elthorn_Dani_cine_3.m3u8"


@app.get("/api/test_m3u8")
def test_m3u8(
    user_id: str = Query(TEST_M3U8_USER, min_length=1),
    folder: str = Query(TEST_M3U8_FOLDER),
    filename: str = Query(TEST_M3U8_FILENAME),
    expires: int = Query(900, ge=60, le=3600),
) -> dict:
    """Returns a CloudFront signed URL for an HLS .m3u8 manifest.

    Uses a CUSTOM policy whose Resource is `<cf_domain>/stream/<user>/<folder>/*`
    so the same Policy/Signature/Key-Pair-Id query string also authorizes
    every .ts segment alongside the manifest. The frontend's HLS player
    extracts that query string and appends it to each segment request.

    Defaults point at the known-good test asset at
        s3://drones-ch-store-dev-1/{TEST_M3U8_USER}/Dani/Elthorn_Dani_cine_3.m3u8
    so the page works regardless of the caller's identity. Override any
    of `user_id` / `folder` / `filename` to sign a different HLS asset.
    """
    _validate_user_id(user_id)
    folder_norm = _safe_relative_path(folder)
    if Path(filename).suffix.lower() != ".m3u8":
        raise HTTPException(status_code=400, detail="filename must end in .m3u8")
    file_key = "/".join(p for p in [user_id, folder_norm, filename] if p)
    allow_prefix = "/".join(p for p in [user_id, folder_norm] if p)
    url = cf_sign.sign_url_with_path_policy(
        file_s3_key=file_key,
        allow_prefix=allow_prefix,
        expires_in=expires,
    )
    if not url:
        raise HTTPException(status_code=503, detail="cloudfront signing not configured")
    return {"url": url, "expires_in": expires}


# Local HLS test asset on the developer's machine — served same-origin (via
# the Next dev rewrite) so the browser never goes cross-origin to CloudFront
# for /api/test_m3u8_local/*. Used by the "m3u8 test (2)" page to validate
# HLS playback end-to-end without involving the CDN signing path at all.
# Override TEST_M3U8_LOCAL_DIR via env if you ever move the asset.
TEST_M3U8_LOCAL_DIR = Path(
    os.environ.get(
        "TEST_M3U8_LOCAL_DIR",
        # Streamable HLS variant (re-encoded ~10 Mbps) — the original
        # `m3u8/` dir at ~127 Mbps stalls on most networks. Override via
        # env if pointing at another HLS asset for testing.
        "/Users/gaborfekete/Movies/drone/20260501_UK_Elthorn_Park/m3u8_streamable2/hls",
    )
).resolve()
_M3U8_MEDIA_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".m3u": "application/vnd.apple.mpegurl",
    ".ts": "video/MP2T",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".vtt": "text/vtt",
}


@app.get("/api/test_m3u8_local/{filename:path}")
def test_m3u8_local(filename: str) -> FileResponse:
    """Serve a manifest or segment from the local-disk HLS test directory.

    The frontend `m3u8 test (2)` page hits this same-origin (via Next's
    /api/backend/* rewrite). Relative .ts URLs in the manifest resolve to
    /api/backend/test_m3u8_local/<segment>.ts which lands here, so hls.js
    fetches segments same-origin too — no CloudFront, no CORS, no signed
    URLs. Plain `<video src=…>` works in Safari for the same reason.
    """
    parts = [p for p in filename.split("/") if p]
    if not parts:
        raise HTTPException(status_code=400, detail="filename required")
    for p in parts:
        if p in {".", ".."} or "\\" in p:
            raise HTTPException(status_code=400, detail="invalid filename")

    target = (TEST_M3U8_LOCAL_DIR / Path(*parts)).resolve()
    # Defense in depth — refuse any path that resolves outside the test dir.
    if TEST_M3U8_LOCAL_DIR != target and TEST_M3U8_LOCAL_DIR not in target.parents:
        raise HTTPException(status_code=400, detail="path escapes test dir")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="not found")

    media_type = _M3U8_MEDIA_TYPES.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(target, media_type=media_type)


# ---------------------------------------------------------------------------
# Sharing & visibility
# ---------------------------------------------------------------------------


def _normalize_path(p: str) -> str:
    return "/".join(part for part in p.strip("/").split("/") if part)


def _require_owner(video_id: str, user_id: str) -> dict:
    if not user_id.strip():
        raise HTTPException(status_code=403, detail="forbidden")
    video = get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="video not found")
    if video["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="only the owner can do this")
    return video


class VisibilityBody(BaseModel):
    visibility: str  # "public" | "private"


@app.patch("/api/videos/{video_id}/visibility")
def update_visibility(
    video_id: str,
    body: VisibilityBody,
    user_id: str = Query(...),
) -> dict:
    _require_owner(video_id, user_id)
    if body.visibility not in {"public", "private"}:
        raise HTTPException(
            status_code=400, detail="visibility must be public or private"
        )
    set_video_visibility(video_id, body.visibility)
    return {"ok": True, "video_id": video_id, "visibility": body.visibility}


class ShareBody(BaseModel):
    shared_with_user_id: str


@app.get("/api/videos/{video_id}/shares")
def get_video_shares(video_id: str, user_id: str = Query(...)) -> dict:
    _require_owner(video_id, user_id)
    return {"shares": list_video_shares(video_id)}


@app.post("/api/videos/{video_id}/shares")
def create_video_share(
    video_id: str,
    body: ShareBody,
    user_id: str = Query(...),
) -> dict:
    _require_owner(video_id, user_id)
    target = body.shared_with_user_id.strip()
    if not target:
        raise HTTPException(status_code=400, detail="shared_with_user_id required")
    if target == user_id:
        raise HTTPException(status_code=400, detail="cannot share with yourself")
    share_video(video_id, target, user_id)
    return {"ok": True, "shared_with_user_id": target}


@app.delete("/api/videos/{video_id}/shares/{shared_with_user_id}")
def delete_video_share(
    video_id: str,
    shared_with_user_id: str,
    user_id: str = Query(...),
) -> dict:
    _require_owner(video_id, user_id)
    unshare_video(video_id, shared_with_user_id)
    return {"ok": True}


class FolderShareBody(BaseModel):
    path: str = ""
    shared_with_user_id: str


@app.get("/api/folders/shares")
def get_folder_shares(
    user_id: str = Query(...),
    path: str = Query(""),
) -> dict:
    return {"shares": list_folder_shares(user_id, _normalize_path(path))}


@app.post("/api/folders/shares")
def create_folder_share(
    body: FolderShareBody,
    user_id: str = Query(...),
) -> dict:
    target = body.shared_with_user_id.strip()
    if not target:
        raise HTTPException(status_code=400, detail="shared_with_user_id required")
    if target == user_id:
        raise HTTPException(status_code=400, detail="cannot share with yourself")
    share_folder(user_id, _normalize_path(body.path), target, user_id)
    return {"ok": True}


@app.delete("/api/folders/shares")
def delete_folder_share(
    body: FolderShareBody,
    user_id: str = Query(...),
) -> dict:
    unshare_folder(
        user_id,
        _normalize_path(body.path),
        body.shared_with_user_id.strip(),
    )
    return {"ok": True}


@app.get("/api/shared")
def list_shared(user_id: str = Query(..., min_length=1)) -> dict:
    """Videos shared with the caller (via video- or folder-share)."""
    return {"videos": list_shared_with(user_id.strip())}


# ---------------------------------------------------------------------------
# User profile (extra info attached to a Clerk user_id)
# ---------------------------------------------------------------------------


class UpsertLocationBody(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None


# Known social platforms — anything else is dropped on PATCH. Keeps the
# stored JSONB tidy without forcing migrations when adding a new platform.
KNOWN_SOCIAL_PLATFORMS = {
    "youtube",
    "instagram",
    "tiktok",
    "x",
    "facebook",
    "linkedin",
    "website",
}


class PatchProfileBody(BaseModel):
    display_name: Optional[str] = None
    nickname: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    social_links: Optional[dict[str, str]] = None


def _serialize_profile(row: Optional[dict]) -> Optional[dict]:
    if row is None:
        return None
    out = dict(row)
    for k in ("location_updated_at", "created_at", "updated_at"):
        v = out.get(k)
        if v is not None:
            out[k] = v.isoformat()
    out["has_profile_image"] = bool(out.get("profile_image_filename"))
    return out


@app.get("/api/profile")
def get_profile(user_id: str = Query(..., min_length=1)) -> dict:
    _validate_user_id(user_id)
    return {"profile": _serialize_profile(get_user_profile(user_id.strip()))}


@app.patch("/api/profile")
def patch_profile(
    body: PatchProfileBody,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)

    # Whitelist & sanitize social links. Drop empty values, lowercase keys,
    # ignore unknown platforms.
    cleaned_social: dict[str, str] = {}
    if body.social_links:
        for raw_k, raw_v in body.social_links.items():
            k = (raw_k or "").strip().lower()
            v = (raw_v or "").strip()
            if not k or not v:
                continue
            if k not in KNOWN_SOCIAL_PLATFORMS:
                continue
            cleaned_social[k] = v

    row = upsert_user_personal_info(
        user_id.strip(),
        display_name=_str_or_none(body.display_name),
        nickname=_str_or_none(body.nickname),
        description=_str_or_none(body.description),
        country=_str_or_none(body.country),
        city=_str_or_none(body.city),
        social_links=cleaned_social,
    )
    return {"profile": _serialize_profile(row)}


@app.post("/api/profile/photo")
async def upload_profile_photo(
    user_id: str = Query(..., min_length=1),
    photo: UploadFile = File(...),
) -> dict:
    _validate_user_id(user_id)
    if not photo.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    ext = Path(photo.filename).suffix.lower()
    if ext not in PROFILE_PHOTO_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported photo type (allowed: {sorted(PROFILE_PHOTO_EXTS)})",
        )
    user_dir = _user_data_dir(user_id.strip())

    # Remove any older avatar with a different extension so we don't leave
    # orphans when the user uploads a .png to replace a .jpg.
    for old_ext in PROFILE_PHOTO_EXTS:
        old = user_dir / f"profile{old_ext}"
        if old != user_dir / f"profile{ext}" and old.exists():
            old.unlink(missing_ok=True)

    target = user_dir / f"profile{ext}"
    with target.open("wb") as out:
        while True:
            chunk = await photo.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    row = set_profile_photo(user_id.strip(), target.name)
    return {"profile": _serialize_profile(row)}


@app.delete("/api/profile/photo")
def remove_profile_photo(
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    user_dir = _user_data_dir(user_id.strip())
    for ext in PROFILE_PHOTO_EXTS:
        f = user_dir / f"profile{ext}"
        if f.exists():
            f.unlink(missing_ok=True)
    row = set_profile_photo(user_id.strip(), None)
    return {"profile": _serialize_profile(row)}


@app.get("/api/profile/{target_user_id}/photo")
def get_profile_photo(
    target_user_id: str,
    user_id: str = Query(..., min_length=1),
) -> FileResponse:
    """Serve a user's avatar by their user_id. The `user_id` query param is
    the caller — kept for parity with other endpoints, not used for gating
    since avatars are public on this app."""
    _validate_user_id(user_id)
    _validate_user_id(target_user_id)
    profile = get_user_profile(target_user_id.strip())
    fname = profile.get("profile_image_filename") if profile else None
    if not fname:
        raise HTTPException(status_code=404, detail="no photo")
    p = _user_data_dir(target_user_id.strip()) / fname
    if not p.exists():
        raise HTTPException(status_code=404, detail="no photo")
    return FileResponse(p)


@app.get("/api/users/nearby")
def users_nearby(
    user_id: str = Query(..., min_length=1),
    radius_km: float = Query(10.0, gt=0, le=20000),
) -> dict:
    """Users within `radius_km` of the caller, nearest first."""
    _validate_user_id(user_id)
    return {
        "radius_km": radius_km,
        "users": list_nearby_users(user_id.strip(), radius_km),
    }


@app.post("/api/profile/location")
def post_profile_location(
    body: UpsertLocationBody,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    if body.latitude is not None and not (-90.0 <= body.latitude <= 90.0):
        raise HTTPException(status_code=400, detail="invalid latitude")
    if body.longitude is not None and not (-180.0 <= body.longitude <= 180.0):
        raise HTTPException(status_code=400, detail="invalid longitude")
    label = (body.label or "").strip() or None
    row = upsert_user_location(
        user_id.strip(), body.latitude, body.longitude, label
    )
    return {"profile": _serialize_profile(row)}


# ---------------------------------------------------------------------------
# Drones — user's registered devices
# ---------------------------------------------------------------------------


def _serialize_drone(row: Optional[dict]) -> Optional[dict]:
    if row is None:
        return None
    out = dict(row)
    for k in ("created_at", "updated_at", "listed_at"):
        v = out.get(k)
        if v is not None:
            out[k] = v.isoformat()
    # numeric(12,2) comes back as Decimal — coerce to float so the JSON
    # response is plain numbers, not "string-shaped" Decimals.
    sp = out.get("sale_price")
    if sp is not None:
        out["sale_price"] = float(sp)
    out["has_photo"] = bool(out.get("photo_filename"))
    return out


def _parse_optional_float(raw: Optional[str], field: str) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid {field}")


def _parse_optional_int(raw: Optional[str], field: str) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid {field}")


def _str_or_none(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    s = raw.strip()
    return s or None


@app.get("/api/drones")
def list_user_drones(user_id: str = Query(..., min_length=1)) -> dict:
    _validate_user_id(user_id)
    drones = list_drones(user_id.strip())
    return {"drones": [_serialize_drone(d) for d in drones]}


_VALID_DRONE_TYPES = {"video", "fpv"}


def _validate_drone_type(raw: Optional[str]) -> Optional[str]:
    if raw is None or raw == "":
        return None
    v = raw.strip().lower()
    if v not in _VALID_DRONE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"drone_type must be one of {sorted(_VALID_DRONE_TYPES)}",
        )
    return v


@app.post("/api/drones")
async def create_drone(
    user_id: str = Form(..., min_length=1),
    brand: str = Form(..., min_length=1),
    model: str = Form(..., min_length=1),
    drone_type: str = Form("video"),
    nickname: Optional[str] = Form(None),
    max_flight_time_min: Optional[str] = Form(None),
    year_acquired: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
) -> dict:
    _validate_user_id(user_id)
    dtype = _validate_drone_type(drone_type) or "video"
    row = insert_drone(
        user_id=user_id.strip(),
        brand=brand.strip(),
        model=model.strip(),
        drone_type=dtype,
        nickname=_str_or_none(nickname),
        max_flight_time_min=_parse_optional_int(
            max_flight_time_min, "max_flight_time_min"
        ),
        year_acquired=_parse_optional_int(year_acquired, "year_acquired"),
        notes=_str_or_none(notes),
    )
    if photo is not None and photo.filename:
        row = await _save_drone_photo(user_id.strip(), row["id"], photo)
    return {"drone": _serialize_drone(row)}


@app.patch("/api/drones/{drone_id}")
async def patch_drone(
    drone_id: str,
    user_id: str = Query(..., min_length=1),
    brand: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    drone_type: Optional[str] = Form(None),
    nickname: Optional[str] = Form(None),
    max_flight_time_min: Optional[str] = Form(None),
    year_acquired: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    remove_photo: Optional[str] = Form(None),
) -> dict:
    _validate_user_id(user_id)
    if not user_owns_drone(user_id.strip(), drone_id):
        raise HTTPException(status_code=404, detail="drone not found")

    row = update_drone(
        drone_id,
        brand=_str_or_none(brand),
        model=_str_or_none(model),
        drone_type=_validate_drone_type(drone_type),
        nickname=_str_or_none(nickname),
        max_flight_time_min=_parse_optional_int(
            max_flight_time_min, "max_flight_time_min"
        ),
        year_acquired=_parse_optional_int(year_acquired, "year_acquired"),
        notes=_str_or_none(notes),
    )
    if remove_photo and remove_photo.lower() in {"1", "true", "yes"}:
        if row and row.get("photo_filename"):
            (_drones_dir(user_id.strip()) / row["photo_filename"]).unlink(
                missing_ok=True
            )
        row = update_drone(drone_id, clear_photo=True)
    if photo is not None and photo.filename:
        # Replace any existing photo on disk first so we don't leak orphans.
        existing = row or get_drone(drone_id)
        if existing and existing.get("photo_filename"):
            (_drones_dir(user_id.strip()) / existing["photo_filename"]).unlink(
                missing_ok=True
            )
        row = await _save_drone_photo(user_id.strip(), drone_id, photo)
    return {"drone": _serialize_drone(row)}


@app.delete("/api/drones/{drone_id}")
def remove_drone(
    drone_id: str,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    if not user_owns_drone(user_id.strip(), drone_id):
        raise HTTPException(status_code=404, detail="drone not found")
    existing = get_drone(drone_id)
    if existing and existing.get("photo_filename"):
        (_drones_dir(user_id.strip()) / existing["photo_filename"]).unlink(
            missing_ok=True
        )
    delete_drone(drone_id)
    return {"ok": True, "drone_id": drone_id}


SUPPORTED_CURRENCIES = {
    "EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "HUF", "CZK",
}


class ListDroneBody(BaseModel):
    price: float
    currency: str


@app.post("/api/drones/{drone_id}/list")
def list_drone(
    drone_id: str,
    body: ListDroneBody,
    user_id: str = Query(..., min_length=1),
) -> dict:
    """List a drone on the marketplace at the given price + currency."""
    _validate_user_id(user_id)
    if not user_owns_drone(user_id.strip(), drone_id):
        raise HTTPException(status_code=404, detail="drone not found")
    if body.price <= 0:
        raise HTTPException(status_code=400, detail="price must be positive")
    currency = (body.currency or "").strip().upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"currency must be one of {sorted(SUPPORTED_CURRENCIES)}",
        )
    row = list_drone_for_sale(
        drone_id, sale_price=float(body.price), sale_currency=currency
    )
    return {"drone": _serialize_drone(row)}


@app.delete("/api/drones/{drone_id}/list")
def unlist_drone_endpoint(
    drone_id: str,
    user_id: str = Query(..., min_length=1),
) -> dict:
    """Take a drone off the marketplace."""
    _validate_user_id(user_id)
    if not user_owns_drone(user_id.strip(), drone_id):
        raise HTTPException(status_code=404, detail="drone not found")
    row = unlist_drone(drone_id)
    return {"drone": _serialize_drone(row)}


@app.get("/api/marketplace")
def get_marketplace() -> dict:
    """All drones currently listed for sale, newest-first."""
    return {"drones": [_serialize_drone(d) for d in list_marketplace()]}


@app.get("/api/drones/{drone_id}/photo")
def get_drone_photo(
    drone_id: str,
    user_id: str = Query(..., min_length=1),
) -> FileResponse:
    _validate_user_id(user_id)
    if not user_owns_drone(user_id.strip(), drone_id):
        raise HTTPException(status_code=404, detail="drone not found")
    row = get_drone(drone_id)
    if not row or not row.get("photo_filename"):
        raise HTTPException(status_code=404, detail="no photo")
    p = _drones_dir(user_id.strip()) / row["photo_filename"]
    if not p.exists():
        raise HTTPException(status_code=404, detail="no photo")
    return FileResponse(p)


async def _save_drone_photo(
    user_id: str, drone_id: str, photo: UploadFile
) -> dict:
    ext = Path(photo.filename or "").suffix.lower()
    if ext not in DRONE_PHOTO_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported photo type (allowed: {sorted(DRONE_PHOTO_EXTS)})",
        )
    fname = f"{drone_id}{ext}"
    target = _drones_dir(user_id) / fname
    with target.open("wb") as out:
        while True:
            chunk = await photo.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    row = update_drone(drone_id, photo_filename=fname)
    if row is None:
        # Drone disappeared mid-upload — clean up the orphan file.
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail="drone not found")
    return row


# ---------------------------------------------------------------------------
# Video move + folder delete
# ---------------------------------------------------------------------------


class MoveVideoBody(BaseModel):
    target_path: str  # destination folder, relative to the user's root


@app.post("/api/videos/{video_id}/move")
def move_video(
    video_id: str,
    body: MoveVideoBody,
    user_id: str = Query(...),
) -> dict:
    """Move a video (and its cover + meta sidecars) to another folder.

    The destination folder must already exist in app_data — we don't auto-
    create folders here. Refuses with 409 if a file with the same name is
    already in the destination.

    Order minimises orphan risk:
      1. validate everything
      2. s3-mode only — copy the .mp4 in S3
      3. rename the local sidecars (and the .mp4 in volume mode)
      4. update the DB row
      5. s3-mode only — delete the original .mp4 in S3
    A failure between (2) and (5) leaves a duplicate in S3 but the DB and
    sidecars are correct, so listing reflects the moved location.
    """
    video = _require_owner(video_id, user_id)
    src_folder = video["folder_path"] or ""
    filename = video["filename"]
    dst_folder = _safe_relative_path(body.target_path)

    if dst_folder == src_folder:
        raise HTTPException(status_code=400, detail="source and destination are the same")

    # Destination must be an existing folder in app_data.
    dst_dir = _resolve_inside_user(user_id, dst_folder)
    if not dst_dir.exists() or not dst_dir.is_dir():
        raise HTTPException(status_code=404, detail="destination folder does not exist")

    # Refuse name collisions in the destination — neither the .mp4 nor
    # either sidecar may already exist.
    cover_filename = video.get("cover_filename")
    meta_name = filename + META_SUFFIX
    if (
        (dst_dir / filename).exists()
        or (dst_dir / meta_name).exists()
        or (cover_filename and (dst_dir / cover_filename).exists())
    ):
        raise HTTPException(status_code=409, detail="destination already has a file with this name")

    src_dir = _resolve_inside_user(user_id, src_folder)

    if STORAGE == "s3":
        # 1. copy .mp4 in S3
        if not s3.copy_video(user_id, src_folder, filename, dst_folder, filename):
            raise HTTPException(status_code=502, detail="s3: copy failed")

    # 2. move local sidecars (and .mp4 in volume mode). Path.rename is atomic
    # on the same filesystem.
    try:
        if STORAGE == "volume":
            (src_dir / filename).rename(dst_dir / filename)
        if cover_filename and (src_dir / cover_filename).exists():
            (src_dir / cover_filename).rename(dst_dir / cover_filename)
        if (src_dir / meta_name).exists():
            (src_dir / meta_name).rename(dst_dir / meta_name)
    except OSError as exc:
        log.error("move_video local rename failed: %s", exc)
        # In s3 mode we already copied the .mp4 — clean it up so we don't
        # leak an orphan in the destination prefix.
        if STORAGE == "s3":
            s3.delete_video(user_id, dst_folder, filename)
        raise HTTPException(status_code=500, detail="filesystem move failed") from exc

    # 3. DB row points at the new folder
    update_video_folder(video_id, dst_folder)

    # 4. s3 — delete the original .mp4 (best-effort, leaves a stray copy if it fails)
    if STORAGE == "s3":
        s3.delete_video(user_id, src_folder, filename)

    return {
        "ok": True,
        "video_id": video_id,
        "from": f"{src_folder}/{filename}" if src_folder else filename,
        "to": f"{dst_folder}/{filename}" if dst_folder else filename,
    }


@app.delete("/api/videos/{video_id}")
def delete_video(
    video_id: str,
    user_id: str = Query(...),
) -> dict:
    """Owner-only delete: removes the .mp4 from S3 (s3 mode) or app_data
    (volume mode), wipes both sidecars from app_data, and deletes the DB row.

    Order: filesystem first (cheapest to roll back), then S3 (best-effort —
    a stray S3 object after a successful DB delete is just garbage to clean
    up later, not a correctness issue), then DB last.
    """
    video = _require_owner(video_id, user_id)
    folder_path = video["folder_path"] or ""
    filename = video["filename"]
    cover_filename = video.get("cover_filename")
    meta_name = filename + META_SUFFIX

    folder_dir = _resolve_inside_user(user_id, folder_path)

    # Sidecars + (volume mode) the .mp4 from app_data.
    for name in [meta_name, cover_filename, filename if STORAGE == "volume" else None]:
        if not name:
            continue
        p = folder_dir / name
        try:
            if p.exists():
                p.unlink()
        except OSError as exc:
            log.warning("delete_video: unlink %s failed: %s", p, exc)

    # .mp4 in S3 (best-effort — DB row will be gone either way).
    if STORAGE == "s3":
        s3.delete_video(user_id, folder_path, filename)

    delete_video_row(video_id)
    return {"ok": True, "video_id": video_id}


@app.delete("/api/folders")
def delete_folder(
    user_id: str = Query(...),
    path: str = Query(..., min_length=1),
) -> dict:
    """Delete a folder if it's empty.

    'Empty' means:
      - no entries in the local app_data directory (no files, no subfolders)
      - in s3 mode, no S3 objects under the prefix other than the folder
        marker itself

    Refuses to delete the user root (`path` must be non-empty)."""
    _validate_user_id(user_id)
    folder_norm = _safe_relative_path(path)
    if not folder_norm:
        raise HTTPException(status_code=400, detail="path is required (cannot delete user root)")

    target = _resolve_inside_user(user_id, folder_norm)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="folder not found")

    local_entries = [p for p in target.iterdir() if not p.name.startswith(".")]
    if local_entries:
        raise HTTPException(status_code=409, detail="folder is not empty")

    if STORAGE == "s3":
        marker_key = s3.folder_marker_key(user_id, folder_norm)
        non_marker = [k for k in s3.list_keys(user_id, folder_norm) if k != marker_key]
        if non_marker:
            log.warning(
                "delete_folder: %d S3 object(s) under %s blocked deletion",
                len(non_marker), marker_key,
            )
            raise HTTPException(
                status_code=409,
                detail="folder is not empty in S3 (orphan objects remain)",
            )
        s3.delete_folder_marker(user_id, folder_norm)

    target.rmdir()
    return {"ok": True, "deleted": folder_norm}


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------


class SendMessageBody(BaseModel):
    recipient_user_id: str
    subject: str
    body: str
    parent_id: Optional[str] = None


def _serialize_message(row: dict) -> dict:
    out = dict(row)
    for k in ("created_at", "read_at"):
        v = out.get(k)
        if v is not None:
            out[k] = v.isoformat()
    return out


def _serialize_thread(row: dict) -> dict:
    out = dict(row)
    for k in ("last_at", "last_read_at"):
        v = out.get(k)
        if v is not None:
            out[k] = v.isoformat()
    return out


@app.get("/api/messages/threads")
def get_threads(user_id: str = Query(..., min_length=1)) -> dict:
    _validate_user_id(user_id)
    return {
        "threads": [
            _serialize_thread(t) for t in list_threads_for_user(user_id.strip())
        ]
    }


@app.get("/api/messages/threads/{thread_id}")
def get_thread(
    thread_id: str,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    msgs = list_thread_messages(thread_id, user_id.strip())
    if msgs is None:
        raise HTTPException(status_code=404, detail="thread not found")
    # Auto-mark every recipient-side message in the thread as read on view.
    mark_thread_read(thread_id, user_id.strip())
    return {
        "thread_id": thread_id,
        "messages": [_serialize_message(m) for m in msgs],
    }


@app.post("/api/messages")
def send_message(
    body: SendMessageBody,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    sender = user_id.strip()
    recipient = body.recipient_user_id.strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="recipient required")
    if recipient == sender:
        raise HTTPException(status_code=400, detail="can't message yourself")
    subject = body.subject.strip()
    if not subject:
        raise HTTPException(status_code=400, detail="subject required")
    msg_body = body.body.strip()
    if not msg_body:
        raise HTTPException(status_code=400, detail="body required")
    try:
        row = insert_message(
            sender_user_id=sender,
            recipient_user_id=recipient,
            subject=subject,
            body=msg_body,
            parent_id=body.parent_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": _serialize_message(row)}


@app.post("/api/messages/{message_id}/read")
def mark_read(
    message_id: str,
    user_id: str = Query(..., min_length=1),
) -> dict:
    _validate_user_id(user_id)
    updated = mark_message_read(message_id, user_id.strip())
    return {"ok": True, "updated": updated}


@app.get("/api/messages/unread")
def get_unread(
    user_id: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
) -> dict:
    _validate_user_id(user_id)
    return {
        "messages": [
            _serialize_message(m)
            for m in list_unread_for_user(user_id.strip(), limit)
        ]
    }


@app.get("/api/messages/unread-count")
def get_unread_count(user_id: str = Query(..., min_length=1)) -> dict:
    _validate_user_id(user_id)
    return {"count": count_unread_for_user(user_id.strip())}
