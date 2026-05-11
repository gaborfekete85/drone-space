"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import MessagesBell from "./MessagesBell";
import SideNav, { NAV_ITEMS } from "./SideNav";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { useUserLocation } from "./useUserLocation";

const EXPANDED_WIDTH = "w-60"; // 240 px — full labels
const RAIL_WIDTH = "w-14"; //  56 px — icons-only rail

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sidebar state — desktop only. The hamburger toggles between the
  // full-width drawer and the rail. On mobile the sidebar is hidden
  // entirely (md:flex on the <aside>) and the nav drop-down on the right
  // takes over.
  const [expanded, setExpanded] = useState(true);

  // Mobile-only drop-down anchored next to the theme switcher.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user } = useUser();
  const location = useUserLocation(user?.id);

  // Close the drop-down on outside click and on route change.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(e.target as Node)
      ) {
        setMobileNavOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 px-3 sm:px-4 h-14">
        {/* Left cluster: hamburger + brand */}
        <div className="flex items-center gap-2">
          {/* Hamburger toggles the sidebar — desktop only; on mobile the
              sidebar is fully hidden so the button has no purpose there. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={expanded}
            className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            aria-label="DroneSpace home"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white dark:bg-orange-500">
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
                <circle cx="5" cy="5" r="2" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="19" r="2" />
                <circle cx="19" cy="19" r="2" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
                <path d="M7 5h10M7 19h10M5 7v10M19 7v10" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              DroneSpace
            </span>
          </Link>
        </div>

        {/* Right cluster: mobile nav (md:hidden) + theme + account */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div ref={mobileNavRef} className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Open navigation"
              aria-haspopup="menu"
              aria-expanded={mobileNavOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {/* Distinct from the hamburger so the two purposes don't blur
                  on mid-sized screens during transitions. */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden
              >
                <circle cx="5" cy="5" r="1.6" />
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="19" cy="5" r="1.6" />
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
                <circle cx="5" cy="19" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
                <circle cx="19" cy="19" r="1.6" />
              </svg>
            </button>

            {mobileNavOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-50 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/5"
              >
                {NAV_ITEMS.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      role="menuitem"
                      className={
                        "flex items-center gap-3 px-4 py-3 text-sm font-medium transition " +
                        (active
                          ? "bg-brand-50 text-brand-700 dark:bg-orange-500/15 dark:text-orange-400"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700")
                      }
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {location.label && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title={
                location.latitude != null && location.longitude != null
                  ? `${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`
                  : undefined
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-brand-600 dark:text-orange-400"
                aria-hidden
              >
                <path d="M12 22s7-7.58 7-13a7 7 0 10-14 0c0 5.42 7 13 7 13z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span className="max-w-[14rem] truncate">{location.label}</span>
            </span>
          )}
          {user?.id && <MessagesBell userId={user.id} />}
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Body: sidebar (md+ only) + main */}
      <div className="flex flex-1 min-h-0">
        <aside
          className={
            "hidden md:flex shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out " +
            (expanded ? EXPANDED_WIDTH : RAIL_WIDTH)
          }
        >
          <SideNav expanded={expanded} />
        </aside>
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>

      <footer className="px-4 sm:px-6 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        &copy; {new Date().getFullYear()} DroneSpace — Aerial footage, mapped to
        the world.
      </footer>
    </div>
  );
}
