"""DroneSpace backend — file-system-backed video library.

Storage layout:
    APP_DATA_ROOT/
        videos/
            <user_id>/
                <folder>/<sub-folder>/.../<video.mp4>
                <folder>/<sub-folder>/.../<video.mp4>.meta.json
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
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import s3
from db import get_video, insert_video, list_video_ids, run_migrations

log = logging.getLogger("dronespace.backend")

APP_DATA_ROOT = Path(
    os.environ.get(
        "APP_DATA_ROOT",
        "/Users/gaborfekete/my-projects/drone/app_data",
    )
).resolve()
VIDEOS_ROOT = APP_DATA_ROOT / "videos"
VIDEOS_ROOT.mkdir(parents=True, exist_ok=True)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
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


def _safe_user_root(user_id: str) -> Path:
    if not user_id or "/" in user_id or "\\" in user_id or user_id in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid user_id")
    root = VIDEOS_ROOT / user_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve_inside_user(user_id: str, rel_path: str) -> Path:
    user_root = _safe_user_root(user_id).resolve()
    rel = (rel_path or "").strip().strip("/")
    target = (user_root / rel).resolve() if rel else user_root
    if user_root != target and user_root not in target.parents:
        raise HTTPException(status_code=400, detail="path escapes user root")
    return target


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
    return {"ok": True, "videos_root": str(VIDEOS_ROOT)}


@app.get("/api/folders")
def list_folder(
    user_id: str = Query(..., min_length=1),
    path: str = Query(""),
) -> dict:
    target = _resolve_inside_user(user_id, path)
    if not target.exists():
        target.mkdir(parents=True, exist_ok=True)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="not a folder")

    parts = [p for p in (path or "").strip("/").split("/") if p]
    folder_path_norm = "/".join(parts)
    ids_by_filename = list_video_ids(user_id, folder_path_norm)

    folders: list[dict] = []
    videos: list[dict] = []
    for entry in sorted(target.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith(".") or entry.name.endswith(META_SUFFIX):
            continue
        if entry.name.endswith(COVER_SUFFIX):
            continue
        if entry.is_dir():
            folders.append({"name": entry.name})
        elif entry.is_file() and _is_video(entry):
            stat = entry.stat()
            cover_path = _cover_for(entry)
            videos.append(
                {
                    "id": ids_by_filename.get(entry.name),
                    "name": entry.name,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat(),
                    "metadata": _read_metadata(entry),
                    "cover_filename": (
                        cover_path.name if cover_path.exists() else None
                    ),
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
    parent = _resolve_inside_user(body.user_id, body.path)
    parent.mkdir(parents=True, exist_ok=True)
    new_folder = parent / name
    if new_folder.exists():
        raise HTTPException(status_code=409, detail="folder already exists")
    new_folder.mkdir(parents=False, exist_ok=False)
    rel = "/".join([*[p for p in body.path.strip("/").split("/") if p], name])
    s3.create_folder_marker(body.user_id, rel)
    return {"ok": True, "path": rel}


@app.post("/api/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    user_id: str = Form(...),
    path: str = Form(""),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    cover: Optional[UploadFile] = File(None),
) -> dict:
    target_dir = _resolve_inside_user(user_id, path)
    target_dir.mkdir(parents=True, exist_ok=True)

    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")
    raw_name = Path(file.filename).name
    if Path(raw_name).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported file type (allowed: {sorted(VIDEO_EXTENSIONS)})",
        )

    target_file = target_dir / raw_name
    if target_file.exists():
        stem, suffix = target_file.stem, target_file.suffix
        i = 1
        while target_file.exists():
            target_file = target_dir / f"{stem}-{i}{suffix}"
            i += 1

    bytes_written = 0
    with target_file.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            bytes_written += len(chunk)

    try:
        meta_payload = json.loads(metadata) if metadata else {}
        if not isinstance(meta_payload, dict):
            meta_payload = {}
    except json.JSONDecodeError:
        meta_payload = {}

    meta_payload.setdefault("uploaded_at", datetime.now(timezone.utc).isoformat())
    meta_payload["original_filename"] = raw_name
    meta_payload["size_bytes"] = bytes_written

    meta_path = target_file.with_name(target_file.name + META_SUFFIX)
    meta_path.write_text(json.dumps(meta_payload, indent=2))

    cover_filename: Optional[str] = None
    if cover is not None and cover.filename:
        cover_ext = Path(cover.filename).suffix.lower()
        if cover_ext not in {".jpg", ".jpeg"}:
            raise HTTPException(
                status_code=415,
                detail="cover must be a .jpg / .jpeg image",
            )
        cover_path = _cover_for(target_file)
        with cover_path.open("wb") as out:
            while True:
                chunk = await cover.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        cover_filename = cover_path.name

    folder_path_norm = "/".join(p for p in path.strip("/").split("/") if p)
    insert_video(
        user_id=user_id,
        folder_path=folder_path_norm,
        filename=target_file.name,
        cover_filename=cover_filename,
        size_bytes=bytes_written,
        metadata=meta_payload,
    )

    cover_for_s3 = (
        target_file.with_name(cover_filename) if cover_filename else None
    )
    background_tasks.add_task(
        s3.upload_video_bundle,
        user_id=user_id,
        folder_path=folder_path_norm,
        video_path=target_file,
        cover_path=cover_for_s3,
        meta_path=meta_path,
    )

    rel = "/".join(
        [*[p for p in path.strip("/").split("/") if p], target_file.name]
    )
    return {
        "ok": True,
        "name": target_file.name,
        "path": rel,
        "size": bytes_written,
        "metadata": meta_payload,
        "cover_filename": cover_filename,
        "s3_enabled": s3.is_enabled(),
    }


@app.get("/api/cover")
def get_cover(
    user_id: str = Query(...),
    path: str = Query(...),
) -> FileResponse:
    target = _resolve_inside_user(user_id, path)
    if (
        not target.exists()
        or not target.is_file()
        or not target.name.endswith(COVER_SUFFIX)
    ):
        raise HTTPException(status_code=404, detail="cover not found")
    return FileResponse(target, media_type="image/jpeg")


@app.get("/api/stream")
def stream_video(
    user_id: str = Query(...),
    path: str = Query(...),
) -> FileResponse:
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
    """Authorize playback for a video and return a presigned S3 URL.

    Access policy (for now): the request must come from a logged-in user,
    which we represent here as a non-empty user_id. The Clerk middleware in
    front of the proxy already enforces auth at the edge; this is a defense
    in depth check.
    """
    if not user_id.strip():
        raise HTTPException(status_code=403, detail="forbidden")

    video = get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="video not found")

    if not s3.is_enabled():
        raise HTTPException(
            status_code=503, detail="s3 mirror is not configured on the backend"
        )

    key = s3.video_key(video["user_id"], video["folder_path"], video["filename"])
    url = s3.presign_get_url(key, expires=expires)
    if not url:
        raise HTTPException(
            status_code=502,
            detail="failed to presign — object missing in S3 or credentials issue",
        )

    return {
        "video_id": video["id"],
        "url": url,
        "expires_in": expires,
    }
