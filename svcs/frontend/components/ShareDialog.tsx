"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  target: ShareTarget;
  /** Called whenever a mutation succeeds (visibility change, share, unshare). */
  onUpdate?: () => void;
};

function Avatar({ user, size = 28 }: { user: ShareableUser; size?: number }) {
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (user.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.imageUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

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
  const [visibility, setVisibility] = useState<"public" | "private">(
    target.kind === "video" ? target.visibility : "private"
  );

  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);

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

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`failed to load users (${res.status})`);
      const j = await res.json();
      setUsers(j.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      loadUsers();
      setQuery("");
      setPickerOpen(false);
      setActiveIdx(0);
      setError(null);
      if (target.kind === "video") setVisibility(target.visibility);
    }
  }, [open, refresh, loadUsers, target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pickerOpen]);

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const sharedIds = useMemo(
    () => new Set(shares.map((s) => s.shared_with_user_id)),
    [shares]
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = users.filter((u) => !sharedIds.has(u.id));
    if (!q) return base;
    return base.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, sharedIds, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, pickerOpen]);

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

  async function addShare(sharedWithUserId: string) {
    const u = sharedWithUserId.trim();
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
      setQuery("");
      setPickerOpen(false);
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

  function onPickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPickerOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(filteredUsers.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const u = filteredUsers[activeIdx];
      if (u) addShare(u.id);
    } else if (e.key === "Escape") {
      if (pickerOpen) {
        e.preventDefault();
        setPickerOpen(false);
      }
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
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 px-5 py-4 dark:border-slate-800">
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

            <div className="relative mt-2" ref={pickerRef}>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onKeyDown={onPickerKeyDown}
                placeholder={
                  usersLoading ? "Loading users…" : "Search by name or email…"
                }
                disabled={usersLoading}
                aria-autocomplete="list"
                aria-expanded={pickerOpen}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30"
              />
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPickerOpen((v) => !v)}
                aria-label={pickerOpen ? "Close user list" : "Open user list"}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={
                    "h-4 w-4 transition-transform " +
                    (pickerOpen ? "rotate-180" : "")
                  }
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {pickerOpen && !usersLoading && (
                <div className="absolute left-0 right-0 z-10 mt-1 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {users.length === 0
                        ? "No users available."
                        : "No matches."}
                    </div>
                  ) : (
                    filteredUsers.map((u, idx) => (
                      <button
                        type="button"
                        key={u.id}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => addShare(u.id)}
                        disabled={busy}
                        className={
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition " +
                          (idx === activeIdx
                            ? "bg-slate-100 dark:bg-slate-800"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60")
                        }
                      >
                        <Avatar user={u} />
                        <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-slate-100">
                          <span className="font-medium">{u.name}</span>
                          {u.email && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {" "}
                              ({u.email})
                            </span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
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
                shares.map((s) => {
                  const u = usersById.get(s.shared_with_user_id);
                  return (
                    <li
                      key={s.shared_with_user_id}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {u ? (
                          <Avatar user={u} />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                          {u ? (
                            <>
                              <span className="font-medium">{u.name}</span>
                              {u.email && (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {" "}
                                  ({u.email})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-mono text-xs">
                              {s.shared_with_user_id}
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShare(s.shared_with_user_id)}
                        disabled={busy}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
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

