"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  /** Pre-selected recipient (e.g. when starting a message from a profile). */
  initialRecipientId?: string | null;
  /** Pre-filled subject (e.g. "Re: …"). */
  initialSubject?: string;
  /** When set, the message is a reply in that thread; backend resolves the
   * thread via parent_id which is the latest message in that thread. */
  parentMessageId?: string | null;
  onSent: (threadId: string) => void;
};

function Avatar({ user, size = 24 }: { user: ShareableUser; size?: number }) {
  if (user.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.imageUrl}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export default function NewMessageDialog({
  open,
  onClose,
  userId,
  initialRecipientId = null,
  initialSubject = "",
  parentMessageId = null,
  onSent,
}: Props) {
  const isReply = parentMessageId !== null;

  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [recipientId, setRecipientId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecipientId(initialRecipientId ?? "");
    setQuery("");
    setSubject(initialSubject);
    setBody("");
    setError(null);
    setBusy(false);
    setPickerOpen(false);
    setActiveIdx(0);
  }, [open, initialRecipientId, initialSubject]);

  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((j) => setUsers(j.users ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load users"))
      .finally(() => setUsersLoading(false));
  }, [open]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    if (pickerOpen) document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pickerOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, pickerOpen]);

  const recipientUser = recipientId ? usersById.get(recipientId) : undefined;

  if (!open) return null;

  function pickRecipient(u: ShareableUser) {
    setRecipientId(u.id);
    setQuery("");
    setPickerOpen(false);
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
      if (u) pickRecipient(u);
    } else if (e.key === "Escape" && pickerOpen) {
      e.preventDefault();
      setPickerOpen(false);
    }
  }

  async function submit() {
    if (!recipientId) {
      setError("Pick a recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject required.");
      return;
    }
    if (!body.trim()) {
      setError("Message body required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/messages?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient_user_id: recipientId,
            subject: subject.trim(),
            body: body.trim(),
            parent_id: parentMessageId,
          }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j = await res.json();
      onSent(j.message?.thread_id ?? "");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to send");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30";

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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isReply ? "Reply" : "New message"}
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

        <div className="space-y-4 p-5">
          {!isReply ? (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                To
              </label>
              {recipientUser ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar user={recipientUser} />
                    <span className="truncate">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {recipientUser.name}
                      </span>
                      {recipientUser.email && (
                        <span className="ml-1 text-slate-500 dark:text-slate-400">
                          ({recipientUser.email})
                        </span>
                      )}
                    </span>
                  </span>
                  {/* When the dialog was opened with a pre-selected recipient
                      (profile "Send message" CTA, reply, etc.) we don't show
                      "Change" — that flow is meant to be focused on subject +
                      body only. */}
                  {!initialRecipientId && (
                    <button
                      type="button"
                      onClick={() => setRecipientId("")}
                      className="ml-2 text-xs font-medium text-brand-600 hover:underline dark:text-orange-400"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative mt-1" ref={pickerRef}>
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
                    className={inputCls + " pr-9 disabled:opacity-60"}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  {pickerOpen && !usersLoading && (
                    <div className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {filteredUsers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {users.length === 0 ? "No users available." : "No matches."}
                        </div>
                      ) : (
                        filteredUsers.map((u, idx) => (
                          <button
                            type="button"
                            key={u.id}
                            onMouseEnter={() => setActiveIdx(idx)}
                            onClick={() => pickRecipient(u)}
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
              )}
            </div>
          ) : null}

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about your shoot"
              className={inputCls + " mt-1"}
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Message
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Write something…"
              className={inputCls + " mt-1 resize-y"}
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !recipientId || !subject.trim() || !body.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
