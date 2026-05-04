"use client";

import { useCallback, useEffect, useState } from "react";

export type ShareTarget =
  | {
      kind: "video";
      videoId: string;
      videoName: string;
      visibility: "public" | "private";
    }
  | { kind: "folder"; folderPath: string };

type Share = {
  shared_with_user_id: string;
  shared_by_user_id: string;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  target: ShareTarget;
  /** Called whenever a mutation succeeds (visibility change, share, unshare). */
  onUpdate?: () => void;
};

export default function ShareDialog({
  open,
  onClose,
  userId,
  target,
  onUpdate,
}: Props) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(
    target.kind === "video" ? target.visibility : "private"
  );

  const sharesUrl = useCallback(() => {
    const u = new URL("/api/backend/x", "http://placeholder");
    u.searchParams.set("user_id", userId);
    if (target.kind === "video") {
      u.pathname = `/api/backend/videos/${target.videoId}/shares`;
    } else {
      u.pathname = "/api/backend/folders/shares";
      u.searchParams.set("path", target.folderPath);
    }
    return u.pathname + u.search;
  }, [target, userId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(sharesUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error(`failed to load shares (${res.status})`);
      const j = await res.json();
      setShares(j.shares ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [sharesUrl]);

  useEffect(() => {
    if (open) {
      refresh();
      setNewUserId("");
      setError(null);
      if (target.kind === "video") setVisibility(target.visibility);
    }
  }, [open, refresh, target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function changeVisibility(next: "public" | "private") {
    if (target.kind !== "video") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/videos/${target.videoId}/visibility?user_id=${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: next }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      setVisibility(next);
      onUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to change visibility");
    } finally {
      setBusy(false);
    }
  }

  async function addShare() {
    const u = newUserId.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      const url =
        target.kind === "video"
          ? `/api/backend/videos/${target.videoId}/shares?user_id=${encodeURIComponent(userId)}`
          : `/api/backend/folders/shares?user_id=${encodeURIComponent(userId)}`;
      const body =
        target.kind === "video"
          ? { shared_with_user_id: u }
          : { path: target.folderPath, shared_with_user_id: u };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      setNewUserId("");
      await refresh();
      onUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to share");
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(target_user: string) {
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (target.kind === "video") {
        res = await fetch(
          `/api/backend/videos/${target.videoId}/shares/${encodeURIComponent(target_user)}?user_id=${encodeURIComponent(userId)}`,
          { method: "DELETE" }
        );
      } else {
        res = await fetch(
          `/api/backend/folders/shares?user_id=${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: target.folderPath,
              shared_with_user_id: target_user,
            }),
          }
        );
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      await refresh();
      onUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to remove share");
    } finally {
      setBusy(false);
    }
  }

  const title =
    target.kind === "video"
      ? `Share "${target.videoName}"`
      : `Share folder /${target.folderPath || "(root)"}`;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 p-5">
          {target.kind === "video" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Visibility
              </h3>
              <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                {(["private", "public"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={busy}
                    onClick={() => changeVisibility(v)}
                    className={
                      "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition " +
                      (visibility === v
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white")
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {visibility === "public"
                  ? "Anyone signed in can play this video."
                  : "Only you and the people you've shared with can play this video."}
              </p>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Shared with
            </h3>

            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="Clerk user ID (e.g. user_2NiW…)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addShare();
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30"
              />
              <button
                type="button"
                onClick={addShare}
                disabled={busy || !newUserId.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
              >
                Share
              </button>
            </div>

            <ul className="mt-3 space-y-1">
              {loading ? (
                <li className="text-xs text-slate-500 dark:text-slate-400">
                  Loading…
                </li>
              ) : shares.length === 0 ? (
                <li className="text-xs text-slate-500 dark:text-slate-400">
                  Not shared with anyone yet.
                </li>
              ) : (
                shares.map((s) => (
                  <li
                    key={s.shared_with_user_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                      {s.shared_with_user_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeShare(s.shared_with_user_id)}
                      disabled={busy}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
