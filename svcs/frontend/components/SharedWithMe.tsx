"use client";

import { useCallback, useEffect, useState } from "react";

type SharedVideo = {
  id: string;
  user_id: string;
  folder_path: string;
  filename: string;
  cover_filename: string | null;
  size: number;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  height_m: number | null;
  tags: string[] | null;
  taken_at: string | null;
  drone_type: string | null;
  uploaded_at: string;
  visibility: "public" | "private";
  share_type: "video" | "folder";
  shared_by_user_id: string;
};

type ApiResponse = {
  videos: Array<
    Omit<SharedVideo, "size"> & { size_bytes?: number; size?: number }
  >;
};

export default function SharedWithMe({ userId }: { userId: string }) {
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/shared?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j: ApiResponse = await res.json();
      setVideos(
        (j.videos ?? []).map((v) => ({
          ...v,
          size: v.size ?? v.size_bytes ?? 0,
        })) as SharedVideo[]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function play(video: SharedVideo) {
    setPlayError(null);
    try {
      const res = await fetch(
        `/api/backend/check_access?video_id=${encodeURIComponent(video.id)}&user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (res.status === 403) {
        setPlayError("Access to this video has been revoked.");
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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-orange-400">
          Library
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Shared with me
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Videos other users have shared with you — directly or by sharing a
          containing folder.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Loading…
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nothing has been shared with you yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const coverUrl = v.cover_filename
              ? `/api/backend/cover?user_id=${encodeURIComponent(v.user_id)}&path=${encodeURIComponent(
                  [v.folder_path, v.cover_filename].filter(Boolean).join("/")
                )}`
              : null;
            return (
              <article
                key={v.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-orange-500/20"
              >
                <button
                  type="button"
                  onClick={() => play(v)}
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
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                    {v.share_type === "folder" ? "via folder" : "shared"}
                  </span>
                </button>

                <div className="space-y-2 p-4">
                  <h3 className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
                    {v.filename}
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    in <span className="font-mono">/{v.folder_path || "(root)"}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Shared by{" "}
                    <span className="font-mono">{v.shared_by_user_id}</span>
                  </div>
                  {v.location && (
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      📍 {v.location}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

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
          {/* Debug: surface the temporary S3 URL the player is using.
              Same treatment as the My-videos modal so the URL is visible
              for both owner and shared-with playback. */}
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
