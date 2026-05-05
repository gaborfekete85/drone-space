"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type FolderListing = {
  path: string;
  parts: string[];
  folders: { name: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  videoId: string;
  videoName: string;
  /** The folder the video currently lives in (e.g. "trip1" or "trip1/sub"). */
  currentPath: string;
  onMoved?: () => void;
};

export default function MoveVideoDialog({
  open,
  onClose,
  userId,
  videoId,
  videoName,
  currentPath,
  onMoved,
}: Props) {
  const [pickerPath, setPickerPath] = useState("");
  const [data, setData] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/folders?user_id=${encodeURIComponent(userId)}&path=${encodeURIComponent(pickerPath)}`,
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
  }, [userId, pickerPath]);

  useEffect(() => {
    if (open) {
      setPickerPath("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const breadcrumbs = useMemo(() => {
    return [{ label: "My videos", idx: -1 }, ...(data?.parts ?? []).map((p, i) => ({ label: p, idx: i }))];
  }, [data]);

  const isCurrent = pickerPath === currentPath;

  async function move() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/videos/${encodeURIComponent(videoId)}/move?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_path: pickerPath }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      onMoved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "move failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Move video
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {videoName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mt-4 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pick a destination folder
        </p>

        <nav className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-950">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.idx}-${b.label}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-400 dark:text-slate-600">/</span>}
              <button
                type="button"
                onClick={() =>
                  b.idx === -1
                    ? setPickerPath("")
                    : setPickerPath((data?.parts ?? []).slice(0, b.idx + 1).join("/"))
                }
                className={
                  "rounded px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 " +
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

        <div className="mt-3 max-h-72 min-h-[8rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading…
            </div>
          ) : data && data.folders.length > 0 ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.folders.map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() =>
                      setPickerPath((p) => (p ? `${p}/${f.name}` : f.name))
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <FolderIcon />
                    <span className="flex-1 text-slate-900 dark:text-slate-100">
                      {f.name}
                    </span>
                    <ChevronIcon className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No subfolders here.
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Will move to: <span className="font-mono text-slate-700 dark:text-slate-200">/{pickerPath || "(root)"}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={move}
              disabled={busy || isCurrent}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
              title={isCurrent ? "Already in this folder" : undefined}
            >
              {busy ? "Moving…" : "Move here"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500 dark:text-slate-400">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
