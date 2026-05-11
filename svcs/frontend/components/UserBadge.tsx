"use client";

import Link from "next/link";

export type BadgeUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
};

type Props = {
  user: BadgeUser | null | undefined;
  /** Caller's user id — needed so a self-badge routes to /dashboard/profile
   * (the editor) instead of /dashboard/profile/<own-id> which redirects. */
  currentUserId?: string;
  /** Optional small prefix rendered before the name, e.g. "by " on
   * Shared-with-me cards. */
  prefix?: string;
  /** Pixel diameter for the round avatar. Defaults to 24. */
  size?: number;
  /** Hide the name and render avatar only. */
  avatarOnly?: boolean;
  /** Set false to render plain (no Link). Default true. */
  link?: boolean;
  /** Override the rendered string when the badge is the caller. Defaults
   * to "You" — set null to fall back to the user's actual name. */
  selfLabel?: string | null;
  className?: string;
};

function initials(seed: string): string {
  return seed
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({
  user,
  size,
  fallbackSeed,
}: {
  user: BadgeUser | null | undefined;
  size: number;
  fallbackSeed: string;
}) {
  const url = user?.imageUrl || "";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {initials(fallbackSeed) || "?"}
    </span>
  );
}

export default function UserBadge({
  user,
  currentUserId,
  prefix,
  size = 24,
  avatarOnly = false,
  link = true,
  selfLabel = "You",
  className,
}: Props) {
  // Best-effort label fallback when /api/users hasn't resolved this user
  // (deleted, mid-load, etc.). Keep something readable instead of falling
  // off a cliff to literal "user_3DFy…" everywhere.
  const id = user?.id ?? "";
  const isSelf = currentUserId !== undefined && id === currentUserId;
  const rawName = user?.name?.trim() || "";
  const email = user?.email ?? "";
  const display =
    isSelf && selfLabel
      ? selfLabel
      : rawName || email || (id ? "Pilot" : "Unknown user");
  const fallbackSeed = rawName || email || id || "?";

  const body = (
    <>
      <Avatar user={user} size={size} fallbackSeed={fallbackSeed} />
      {!avatarOnly && (
        <span className="min-w-0 truncate">
          {prefix && (
            <span className="text-slate-500 dark:text-slate-400">{prefix}</span>
          )}
          <span className="font-medium">{display}</span>
        </span>
      )}
    </>
  );

  const baseCls =
    "inline-flex min-w-0 items-center gap-1.5 align-middle " +
    (className ?? "");

  if (!link || !id) {
    return <span className={baseCls}>{body}</span>;
  }
  const href = isSelf
    ? "/dashboard/profile"
    : `/dashboard/profile/${encodeURIComponent(id)}`;
  return (
    <Link
      href={href}
      className={
        baseCls +
        " text-slate-700 hover:text-brand-700 dark:text-slate-200 dark:hover:text-orange-400"
      }
      title={display}
    >
      {body}
    </Link>
  );
}
