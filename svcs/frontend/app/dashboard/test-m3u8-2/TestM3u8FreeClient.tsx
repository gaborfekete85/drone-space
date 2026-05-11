"use client";

import { useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import ReactPlayer from 'react-player'

// Preset sources the dropdown switches between. The "value" in the <option>
// is the underlying URL the player loads. Add more entries here whenever
// another known-good test asset is useful to compare against.
const PRESETS = [
  // {
  //   id: "local",
  //   label: "Local — m3u8_streamable (re-encoded, ~10 Mbps)",
  //   url: "/api/backend/test_m3u8_local/Elthorn_Dani_cine_3.m3u8",
  // },
  {
    id: "s3",
    label: "S3 public — gabor-fekete-mi-kis-falunk/test-video",
    url: "https://gabor-fekete-mi-kis-falunk.s3.eu-north-1.amazonaws.com/test-video/Elthorn_Dani_cine_3.m3u8",
  },
] as const;
const DEFAULT_PRESET = PRESETS[0];

export default function TestM3u8FreeClient() {
  const [draft, setDraft] = useState<string>(DEFAULT_PRESET.url);
  // `loaded` is what the player renders. Two-state pattern (draft vs loaded)
  // so editing the URL doesn't continually remount hls.js.
  const [loaded, setLoaded] = useState<string>(DEFAULT_PRESET.url);

  function pickPreset(url: string) {
    setDraft(url);
    setLoaded(url);
  }

  function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setLoaded(trimmed);
  }

  // The dropdown's selected value: the matching preset URL, or empty when
  // the input has been edited to something custom (so the dropdown clearly
  // shows "Custom URL" instead of misleadingly highlighting a preset).
  const selectedPreset =
    PRESETS.find((p) => p.url === draft)?.url ?? "";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-orange-400">
          Playback test (free URL)
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          m3u8 test (public)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Pick a preset or paste any HLS / video URL and hit{" "}
          <span className="font-mono">Load</span>. The player handles HLS via
          hls.js and falls back to native{" "}
          <span className="font-mono">&lt;video src&gt;</span> in Safari.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:min-w-[6rem]">
          Source
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => {
            if (e.target.value) pickPreset(e.target.value);
          }}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {selectedPreset === "" && (
            <option value="">Custom URL (edited below)</option>
          )}
          {PRESETS.map((p) => (
            <option key={p.id} value={p.url}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleLoad} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://…/playlist.m3u8"
          aria-label="HLS manifest URL"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={!draft.trim() || draft.trim() === loaded}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          Load
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm dark:border-slate-800">
        {/* `key={loaded}` forces VideoPlayer to fully remount on URL change —
            destroys the previous hls.js instance and avoids stale loader
            state from the old source. */}
        <VideoPlayer key={loaded} src={loaded} className="aspect-video w-full" />
      </div>

      <div className="rounded-md bg-slate-950/80 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
        <span className="mr-1 font-semibold text-slate-400">Now playing:</span>
        <span className="break-all font-mono">{loaded}</span>
      </div>

      <div className="rounded-md bg-slate-950/80 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          ffmpeg command used:
        </h1>
        <pre className="whitespace-pre overflow-x-auto rounded-md bg-black p-4 text-sm text-white">
          {`SRC=[SOURCE_FOLDER]/m3u8_streamable2/Elthorn_Dani_cine_2.mov
OUT=[SOURCE_FOLDER]/m3u8_streamable2/hls
mkdir -p "$OUT"

ffmpeg -i "$SRC" \\
-map 0:v:0 -map "0:a?" \\
-vf "scale=-2:1080:flags=lanczos" \\
-c:v libx264 \\
-preset slow \\
-crf 18 \\
-tag:v hvc1 \\
-x265-params "hdr-opt=1:repeat-headers=1:keyint=150:min-keyint=150:scenecut=0:open-gop=0" \\
-pix_fmt yuv420p \\
-maxrate 28M \\
-bufsize 56M \\
-c:a aac \\
-b:a 320k \\
-ac 2 \\
-f hls \\
-hls_time 6 \\
-hls_playlist_type vod \\
-hls_flags independent_segments \\
-hls_segment_type mpegts \\
-hls_segment_filename "$OUT/Elthorn_Dani_cine_2_%03d.ts" \\
"$OUT/Elthorn_Dani_cine_2.m3u8"`}
        </pre>
      </div>
    </div >
  );
}
