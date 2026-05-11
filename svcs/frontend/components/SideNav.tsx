"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export type NavSection = {
  /** Section heading shown above the items. Omit/leave undefined for the
   * top-of-sidebar group (Home) which has no heading. */
  label?: string;
  items: NavItem[];
};

const HOME_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <path d="M3 12l9-9 9 9" />
    <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
  </svg>
);

const MY_VIDEOS_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <rect x="3" y="5" width="15" height="14" rx="2" />
    <path d="M21 8.5l-5 3.5 5 3.5v-7z" />
  </svg>
);

const SHARED_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const TEST_M3U8_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    {/* play-in-circle: hints HLS playback test */}
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
  </svg>
);

const DRONES_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <circle cx="5" cy="5" r="2" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M7 5h10M7 19h10M5 7v10M19 7v10" />
  </svg>
);

const MESSAGES_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const DRONERS_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const MARKETPLACE_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    <path d="M3 9l1-5h16l1 5" />
    <path d="M5 9v11h14V9" />
    <path d="M9 22V12h6v10" />
  </svg>
);

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ href: "/dashboard", label: "Home", icon: HOME_ICON }],
  },
  {
    label: "Videos",
    items: [
      { href: "/dashboard/my-videos", label: "My videos", icon: MY_VIDEOS_ICON },
      { href: "/dashboard/shared", label: "Shared with me", icon: SHARED_ICON },
      { href: "/dashboard/test-m3u8", label: "Test m3u8", icon: TEST_M3U8_ICON },
      { href: "/dashboard/test-m3u8-2", label: "m3u8 test (public)", icon: TEST_M3U8_ICON },
    ],
  },
  {
    label: "Devices",
    items: [
      { href: "/dashboard/drones", label: "My drones", icon: DRONES_ICON },
    ],
  },
  {
    label: "Social",
    items: [
      { href: "/dashboard/messages", label: "Messages", icon: MESSAGES_ICON },
      { href: "/dashboard/droners", label: "Droners around me", icon: DRONERS_ICON },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { href: "/dashboard/marketplace", label: "Drones for sale", icon: MARKETPLACE_ICON },
    ],
  },
];

// Flat list — DashboardShell's mobile dropdown still renders this single list
// without sections to keep the dropdown short.
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export default function SideNav({ expanded }: { expanded: boolean }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return (
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href))
    );
  }

  return (
    <nav className="mt-2 flex-1 px-2">
      {NAV_SECTIONS.map((section, idx) => (
        <div key={section.label ?? `__section-${idx}`}>
          {idx > 0 && (
            <hr className="my-2 border-slate-200 dark:border-slate-800" />
          )}
          {section.label && expanded && (
            <h3 className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {section.label}
            </h3>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Native tooltip in rail mode so each icon is still labelled.
                    title={!expanded ? item.label : undefined}
                    className={
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
                      (active
                        ? "bg-brand-50 text-brand-700 dark:bg-orange-500/15 dark:text-orange-400"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white")
                    }
                  >
                    {item.icon}
                    {expanded && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
