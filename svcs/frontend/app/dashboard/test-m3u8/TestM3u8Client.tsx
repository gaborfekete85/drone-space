"use client";

import { useCallback, useEffect, useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";

export default function TestM3u8Client() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No user_id — the backend defaults to the known-good test asset.
      // (The page is a CDN playback demo, not per-user content.)
      const res = await fetch(`/api/backend/test_m3u8`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string; expires_in: number };
      setUrl(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-orange-400">
          Playback test
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Test m3u8 (HLS)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Plays{" "}
          <span className="font-mono">Dani/Elthorn_Dani_cine_3.m3u8</span> via a
          CloudFront signed URL. The same Policy/Signature/Key-Pair-Id query
          string is reused on every <span className="font-mono">.ts</span>{" "}
          fragment so all peers resolve through CloudFront.
        </p>
      </header>

      {loading && !url && (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Requesting signed URL…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {url && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm dark:border-slate-800">
            <VideoPlayer src={url} className="aspect-video w-full" />
          </div>
          <div className="rounded-md bg-slate-950/80 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
            <span className="mr-1 font-semibold text-slate-400">
              Cloudfront signed URL:
            </span>
            <span className="break-all font-mono">{url}</span>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Refresh signed URL
          </button>
        </div>
      )}
    </div>
  );
}
