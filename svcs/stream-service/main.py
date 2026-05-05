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

import s3
from db import (
    delete_video_row,
    get_video,
    insert_video,
    list_folder_shares,
    list_shared_with,
    list_video_meta,
    list_video_shares,
    run_migrations,
    set_video_visibility,
    share_folder,
    share_video,
    unshare_folder,
    unshare_video,
    update_video_folder,
    user_can_access_video,
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

APP_DATA_ROOT = Path(
    os.environ.get(
        "APP_DATA_ROOT",
        "/Users/gaborfekete/my-projects/drone/app_data",
    )
).resolve()
VIDEOS_ROOT = APP_DATA_ROOT / "videos"
# app_data is the metadata index in both modes — always create it.
VIDEOS_ROOT.mkdir(parents=True, exist_ok=True)

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
        url = s3.presign_video_url(user_id, folder, filename, expires=900)
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

    s3 mode → presigned S3 URL.
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
        key = s3.video_key(video["user_id"], video["folder_path"], video["filename"])
        url = s3.presign_get_url(key, expires=expires)
        if not url:
            raise HTTPException(
                status_code=502,
                detail="failed to presign — object missing in S3 or credentials issue",
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
