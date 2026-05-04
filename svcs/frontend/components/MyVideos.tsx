"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UploadVideoModal from "./UploadVideoModal";

type VideoEntry = {
  id: string | null;
  name: string;
  size: number;
  uploaded_at: string;
  cover_filename?: string | null;
  metadata: Record<string, unknown> & {
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    height_m?: number | null;
    tags?: string[];
    taken_at?: string | null;
    drone_type?: string;
  };
};

type FolderListing = {
  user_id: string;
  path: string;
  parts: string[];
  folders: { name: string }[];
  videos: VideoEntry[];
};

type Props = {
  userId: string;
};

export default function MyVideos({ userId }: Props) {
  const [path, setPath] = useState("");
  const [data, setData] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  async function openVideo(video: VideoEntry) {
    setPlayError(null);
    if (!video.id) {
      setPlayError(
        "This video has no database record yet — it was created before the DB sync."
      );
      return;
    }
    try {
      const res = await fetch(
        `/api/backend/check_access?video_id=${encodeURIComponent(video.id)}&user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (res.status === 403) {
        setPlayError("You don't have access to this video.");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `playback failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      setPreviewUrl(body.url);
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : "playback failed");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/folders?user_id=${encodeURIComponent(userId)}&path=${encodeURIComponent(path)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed to load (${res.status})`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId, path]);

  useEffect(() => {
    load();
  }, [load]);

  function enterFolder(name: string) {
    setPath((p) => (p ? `${p}/${name}` : name));
  }

  function jumpTo(idx: number) {
    if (!data) return;
    setPath(data.parts.slice(0, idx + 1).join("/"));
  }

  async function createFolder() {
    const name = window.prompt("New folder name");
    if (!name) return;
    try {
      const res = await fetch("/api/backend/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, path, name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "failed to create folder");
    }
  }

  const breadcrumbs = useMemo(() => {
    return [{ label: "My videos", idx: -1 }, ...(data?.parts ?? []).map((p, i) => ({ label: p, idx: i }))];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-orange-400">
            Library
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            My videos
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createFolder}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FolderPlusIcon /> New folder
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            <UploadIcon /> Upload video
          </button>
        </div>
      </header>

      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-600 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        {breadcrumbs.map((b, i) => (
          <span key={`${b.idx}-${b.label}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-400 dark:text-slate-600">/</span>}
            <button
              type="button"
              onClick={() => (b.idx === -1 ? setPath("") : jumpTo(b.idx))}
              className={
                "rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 " +
                (i === breadcrumbs.length - 1
                  ? "font-semibold text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-300")
              }
            >
              {b.label}
            </button>
          </span>
        ))}
      </nav>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Folders */}
      {data && data.folders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Folders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.folders.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => enterFolder(f.name)}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-orange-400/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-orange-500/15 dark:text-orange-400">
                  <FolderIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900 dark:text-white">
                    {f.name}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Open folder
                  </span>
                </span>
                <ChevronIcon className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Videos */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Videos
        </h2>
        {loading && !data ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Loading…
          </div>
        ) : data && data.videos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.videos.map((v) => (
              <VideoTile
                key={v.name}
                video={v}
                coverUrl={
                  v.cover_filename
                    ? `/api/backend/cover?user_id=${encodeURIComponent(userId)}&path=${encodeURIComponent(
                        [path, v.cover_filename].filter(Boolean).join("/")
                      )}`
                    : null
                }
                onPlay={() => openVideo(v)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No videos in this folder yet.
            </p>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
            >
              <UploadIcon /> Upload your first video
            </button>
          </div>
        )}
      </section>

      <UploadVideoModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        userId={userId}
        path={path}
        onUploaded={load}
      />

      {playError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          {playError}
          <button
            type="button"
            onClick={() => setPlayError(null)}
            className="ml-3 font-semibold underline"
          >
            dismiss
          </button>
        </div>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-900/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <video
            src={previewUrl}
            controls
            autoPlay
            className="max-h-[80vh] w-auto max-w-[90vw] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Debug: surface the temporary S3 URL the player is using. */}
          <div
            className="max-w-[90vw] rounded-md bg-slate-950/80 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mr-1 font-semibold text-slate-400">
              S3 presigned (temporal url):
            </span>
            <span className="break-all font-mono">{previewUrl}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoTile({
  video,
  coverUrl,
  onPlay,
}: {
  video: VideoEntry;
  coverUrl: string | null;
  onPlay: () => void;
}) {
  const m = video.metadata ?? {};
  const sizeMb = (video.size / (1024 * 1024)).toFixed(1);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-orange-500/20">
      <button
        type="button"
        onClick={onPlay}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 dark:from-slate-800 dark:to-black"
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
        {coverUrl && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        )}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow-lg transition group-hover:scale-110 dark:bg-orange-500 dark:text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-6 w-6">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        {m.location && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <PinIcon className="h-3 w-3" />
            {m.location}
          </span>
        )}
        {m.drone_type && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
            {m.drone_type === "fpv" ? "FPV" : "Video"}
          </span>
        )}
      </button>

      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
          {video.name}
        </h3>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          {typeof m.latitude === "number" && typeof m.longitude === "number" && (
            <div className="col-span-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {m.latitude.toFixed(4)}°, {m.longitude.toFixed(4)}°
            </div>
          )}
          {typeof m.height_m === "number" && (
            <div>
              <dt className="inline text-slate-500 dark:text-slate-400">Height: </dt>
              <dd className="inline text-slate-700 dark:text-slate-200">{m.height_m} m</dd>
            </div>
          )}
          {m.taken_at && (
            <div>
              <dt className="inline text-slate-500 dark:text-slate-400">Flown: </dt>
              <dd className="inline text-slate-700 dark:text-slate-200">
                {new Date(m.taken_at).toLocaleDateString()}
              </dd>
            </div>
          )}
          <div className="col-span-2 text-[11px] text-slate-500 dark:text-slate-500">
            {sizeMb} MB · uploaded {new Date(video.uploaded_at).toLocaleDateString()}
          </div>
        </dl>

        {Array.isArray(m.tags) && m.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {m.tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-orange-500/10 dark:text-orange-300"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${className}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
