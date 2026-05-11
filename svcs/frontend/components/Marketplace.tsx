"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import type { Drone } from "./DroneDialog";
import NewMessageDialog from "./NewMessageDialog";
import { formatPrice } from "./SellDroneDialog";

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

function fmtListedAt(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString();
}

export default function Marketplace({ userId }: { userId: string }) {
  const { user: clerkUser } = useUser();
  const [drones, setDrones] = useState<Drone[]>([]);
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [selfAvatarUrl, setSelfAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactSeller, setContactSeller] = useState<Drone | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, uRes, pRes] = await Promise.all([
        fetch("/api/backend/marketplace", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
        // Need the caller's own profile to pick up a custom uploaded avatar —
        // /api/users excludes the caller (so they can't share with themselves
        // in ShareDialog), so we'd otherwise show "?" on our own listings.
        fetch(`/api/backend/profile?user_id=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        }),
      ]);
      if (!mRes.ok) throw new Error(`failed to load (${mRes.status})`);
      const mJson = await mRes.json();
      setDrones(mJson.drones ?? []);
      if (uRes.ok) {
        const uJson = await uRes.json();
        setUsers(uJson.users ?? []);
      }
      if (pRes.ok) {
        const pJson = await pRes.json();
        const p = pJson.profile;
        if (p?.has_profile_image && p?.updated_at) {
          setSelfAvatarUrl(
            `/api/backend/profile/${encodeURIComponent(userId)}/photo?user_id=${encodeURIComponent(userId)}&t=${encodeURIComponent(p.updated_at)}`
          );
        } else {
          setSelfAvatarUrl(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    // Inject the caller. Avatar priority matches the rest of the app:
    // custom upload > Clerk social-login image > initials.
    const selfName =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
      clerkUser?.username ||
      clerkUser?.primaryEmailAddress?.emailAddress ||
      "You";
    m.set(userId, {
      id: userId,
      name: selfName,
      email: clerkUser?.primaryEmailAddress?.emailAddress ?? "",
      imageUrl: selfAvatarUrl ?? clerkUser?.imageUrl ?? "",
    });
    return m;
  }, [users, userId, clerkUser, selfAvatarUrl]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Drones for sale
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Drones other pilots are selling — newest listings first.
        </p>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && drones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Loading…
        </div>
      ) : drones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No drones are listed for sale right now. Check back soon.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drones.map((d) => {
            const seller = usersById.get(d.user_id);
            const isMine = d.user_id === userId;
            const photoUrl = d.has_photo
              ? `/api/backend/drones/${encodeURIComponent(d.id)}/photo?user_id=${encodeURIComponent(d.user_id)}&t=${encodeURIComponent(d.updated_at)}`
              : null;
            return (
              <li
                key={d.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={`${d.brand} ${d.model}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-10 w-10 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="5" r="2" />
                      <circle cx="19" cy="5" r="2" />
                      <circle cx="5" cy="19" r="2" />
                      <circle cx="19" cy="19" r="2" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                      <path d="M7 5h10M7 19h10M5 7v10M19 7v10" />
                    </svg>
                  )}
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                    {d.drone_type === "fpv" ? "FPV" : "Video"}
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-slate-900 dark:text-white">
                      {d.brand} {d.model}
                    </h3>
                    {d.sale_price != null && d.sale_currency && (
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {formatPrice(d.sale_price, d.sale_currency)}
                      </span>
                    )}
                  </div>
                  {d.notes && (
                    <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                      {d.notes}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Link
                      href={
                        isMine
                          ? "/dashboard/profile"
                          : `/dashboard/profile/${encodeURIComponent(d.user_id)}`
                      }
                      className="flex min-w-0 items-center gap-2 text-xs text-slate-700 hover:text-brand-700 dark:text-slate-300 dark:hover:text-orange-400"
                    >
                      <SellerAvatar user={seller} />
                      <span className="min-w-0 truncate">
                        {isMine
                          ? "You"
                          : seller?.name ?? d.user_id}
                      </span>
                    </Link>
                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                      {d.listed_at ? fmtListedAt(d.listed_at) : ""}
                    </span>
                  </div>
                  {!isMine && (
                    <button
                      type="button"
                      onClick={() => setContactSeller(d)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
                    >
                      Contact seller
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NewMessageDialog
        open={contactSeller !== null}
        onClose={() => setContactSeller(null)}
        userId={userId}
        initialRecipientId={contactSeller?.user_id ?? null}
        initialSubject={
          contactSeller
            ? `Interested in your ${contactSeller.brand} ${contactSeller.model}`
            : ""
        }
        onSent={() => setContactSeller(null)}
      />
    </div>
  );
}

function SellerAvatar({ user }: { user: ShareableUser | undefined }) {
  if (user?.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.imageUrl}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full object-cover"
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
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
      {initials}
    </span>
  );
}
