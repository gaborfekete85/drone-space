"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";

export default function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const fetchAvatar = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `/api/backend/profile?user_id=${encodeURIComponent(user.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const j = await res.json();
      const p = j.profile;
      if (p?.has_profile_image && p?.updated_at) {
        // ?t=<updated_at> is a cache buster — replacing the photo bumps
        // updated_at so the browser re-fetches instead of showing a stale copy.
        setCustomAvatarUrl(
          `/api/backend/profile/${encodeURIComponent(user.id)}/photo?user_id=${encodeURIComponent(user.id)}&t=${encodeURIComponent(p.updated_at)}`
        );
      } else {
        setCustomAvatarUrl(null);
      }
    } catch {
      // Header chrome shouldn't yell at the user — fall back to Clerk image.
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAvatar();
  }, [fetchAvatar]);

  // Refresh whenever the route changes — the user may have just uploaded a
  // new photo on /dashboard/profile and is now navigating elsewhere.
  useEffect(() => {
    fetchAvatar();
  }, [pathname, fetchAvatar]);

  // Refresh when the menu opens too, so the avatar is always current the
  // first thing the user sees if they pop it open.
  useEffect(() => {
    if (open) fetchAvatar();
  }, [open, fetchAvatar]);

  const avatarUrl = customAvatarUrl || user?.imageUrl || "";

  const initial =
    (isLoaded &&
      (user?.firstName?.[0] ||
        user?.username?.[0] ||
        user?.primaryEmailAddress?.emailAddress?.[0])) ||
    "U";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 pr-3 shadow-sm hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="User avatar"
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white text-sm font-semibold dark:bg-orange-500">
            {String(initial).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-200">
          {user?.firstName || user?.username || "Account"}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-slate-500 dark:text-slate-400"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-50 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/5"
        >
          <Link
            href="/dashboard/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Profile
          </Link>
          <div className="border-t border-slate-100 dark:border-slate-700" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut({ redirectUrl: "/sign-in" });
            }}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
