"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NewMessageDialog from "./NewMessageDialog";
import UserBadge from "./UserBadge";

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

type Thread = {
  thread_id: string;
  last_message_id: string;
  last_sender_user_id: string;
  last_recipient_user_id: string;
  subject: string;
  last_body: string;
  last_at: string;
  last_read_at: string | null;
  unread_count: number;
  participant_count: number;
  counterparty_user_id: string;
};

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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString();
}

function Avatar({ user, size = 36 }: { user?: ShareableUser; size?: number }) {
  if (user?.imageUrl) {
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
  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

export default function Messages({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialThread = searchParams.get("thread");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(initialThread);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const refreshThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/messages/threads?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`failed to load (${res.status})`);
      const j = await res.json();
      setThreads(j.threads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load threads");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

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

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const loadThread = useCallback(
    async (threadId: string) => {
      setThreadLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/backend/messages/threads/${encodeURIComponent(threadId)}?user_id=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`failed (${res.status})`);
        const j = await res.json();
        setThreadMessages(j.messages ?? []);
        // Fetching the thread auto-marks all addressed-to-me messages read on
        // the backend; refresh the inbox so unread counts reflect that.
        await refreshThreads();
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load thread");
      } finally {
        setThreadLoading(false);
      }
    },
    [userId, refreshThreads]
  );

  useEffect(() => {
    if (activeThread) {
      loadThread(activeThread);
    } else {
      setThreadMessages([]);
    }
  }, [activeThread, loadThread]);

  function openThread(threadId: string) {
    setActiveThread(threadId);
    router.replace(`/dashboard/messages?thread=${encodeURIComponent(threadId)}`);
  }

  function closeThread() {
    setActiveThread(null);
    router.replace("/dashboard/messages");
  }

  const activeMessages = threadMessages;
  const lastMessageId =
    activeMessages.length > 0
      ? activeMessages[activeMessages.length - 1].id
      : null;
  const replyRecipient =
    activeMessages.length > 0
      ? activeMessages[activeMessages.length - 1].sender_user_id === userId
        ? activeMessages[activeMessages.length - 1].recipient_user_id
        : activeMessages[activeMessages.length - 1].sender_user_id
      : null;
  const replySubject =
    activeMessages.length > 0
      ? activeMessages[0].subject.startsWith("Re: ")
        ? activeMessages[0].subject
        : `Re: ${activeMessages[0].subject}`
      : "";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Messages
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Direct messages with other DroneSpace pilots.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New message
        </button>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {activeThread === null ? (
        <ThreadList
          threads={threads}
          loading={loading}
          userId={userId}
          usersById={usersById}
          onOpen={openThread}
        />
      ) : (
        <ThreadView
          messages={activeMessages}
          loading={threadLoading}
          userId={userId}
          usersById={usersById}
          onBack={closeThread}
          onReply={() => setReplyOpen(true)}
        />
      )}

      <NewMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        userId={userId}
        onSent={(threadId) => {
          if (threadId) openThread(threadId);
          refreshThreads();
        }}
      />

      <NewMessageDialog
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        userId={userId}
        initialRecipientId={replyRecipient}
        initialSubject={replySubject}
        parentMessageId={lastMessageId}
        onSent={(threadId) => {
          refreshThreads();
          if (threadId) loadThread(threadId);
        }}
      />
    </div>
  );
}

function ThreadList({
  threads,
  loading,
  userId,
  usersById,
  onOpen,
}: {
  threads: Thread[];
  loading: boolean;
  userId: string;
  usersById: Map<string, ShareableUser>;
  onOpen: (id: string) => void;
}) {
  if (loading && threads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Loading…
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No conversations yet.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {threads.map((t) => {
        const cp = usersById.get(t.counterparty_user_id);
        const cpName = cp?.name ?? t.counterparty_user_id;
        const me = t.last_sender_user_id === userId;
        return (
          <li key={t.thread_id}>
            <button
              type="button"
              onClick={() => onOpen(t.thread_id)}
              className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <Avatar user={cp} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {cpName}
                  </span>
                  {t.unread_count > 0 && (
                    <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white dark:bg-orange-500">
                      {t.unread_count}
                    </span>
                  )}
                </div>
                <div className="truncate text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{t.subject}</span>
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {me ? "You: " : ""}
                  {t.last_body}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                {fmtTime(t.last_at)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ThreadView({
  messages,
  loading,
  userId,
  usersById,
  onBack,
  onReply,
}: {
  messages: Message[];
  loading: boolean;
  userId: string;
  usersById: Map<string, ShareableUser>;
  onBack: () => void;
  onReply: () => void;
}) {
  if (loading && messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Loading…
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-brand-600 hover:underline dark:text-orange-400"
        >
          ← Back to inbox
        </button>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Empty thread.
        </p>
      </div>
    );
  }
  const subject = messages[0].subject;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-orange-400"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={onReply}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          Reply
        </button>
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        {subject}
      </h2>
      <ul className="space-y-2">
        {messages.map((m) => {
          const sender = usersById.get(m.sender_user_id) ?? {
            id: m.sender_user_id,
            name: "",
            email: "",
            imageUrl: "",
          };
          const mine = m.sender_user_id === userId;
          return (
            <li
              key={m.id}
              className={
                "rounded-xl border p-3 shadow-sm " +
                (mine
                  ? "ml-8 border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10"
                  : "mr-8 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900")
              }
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <UserBadge
                  user={sender}
                  currentUserId={userId}
                  size={28}
                  className="text-sm font-semibold text-slate-900 dark:text-white"
                />
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {m.body}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
