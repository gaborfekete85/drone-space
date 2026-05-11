"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const POLL_MS = 30_000;
const PREVIEW_LEN = 30;

type Message = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  subject: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

function preview(s: string): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= PREVIEW_LEN) return trimmed;
  return trimmed.slice(0, PREVIEW_LEN) + "…";
}

export default function MessagesBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [unread, setUnread] = useState<Message[]>([]);
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/backend/messages/unread-count?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const j = await res.json();
      setCount(j.count ?? 0);
    } catch {
      // Silent — header polling shouldn't yell at the user.
    }
  }, [userId]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/backend/messages/unread?user_id=${encodeURIComponent(userId)}&limit=10`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const j = await res.json();
      setUnread(j.messages ?? []);
    } catch {
      // ignore
    }
  }, [userId]);

  // Poll unread count quietly while the page is open.
  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(t);
  }, [fetchCount]);

  // Anytime we navigate to /dashboard/messages, refresh the count — opening
  // a thread there marks messages read on the server.
  useEffect(() => {
    if (pathname?.startsWith("/dashboard/messages")) fetchCount();
  }, [pathname, fetchCount]);

  // Load Clerk-resolved users once for sender name lookups.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setUsers(j.users ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh the dropdown contents when it opens.
  useEffect(() => {
    if (open) fetchUnread();
  }, [open, fetchUnread]);

  // Close on outside click.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count > 0 ? `${count} unread messages` : "Messages"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white shadow-sm">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 z-50 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Unread messages
            </span>
            <Link
              href="/dashboard/messages"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-orange-400"
            >
              See all
            </Link>
          </div>
          {unread.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              You're all caught up.
            </div>
          ) : (
            <ul className="max-h-96 overflow-auto">
              {unread.map((m) => {
                const sender = usersById.get(m.sender_user_id);
                return (
                  <li key={m.id}>
                    <Link
                      href={`/dashboard/messages?thread=${encodeURIComponent(m.thread_id)}`}
                      onClick={() => setOpen(false)}
                      className="block border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-900 dark:text-white">
                          {m.subject}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="truncate text-xs text-slate-600 dark:text-slate-300">
                        {sender?.name ?? m.sender_user_id}: {preview(m.body)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
