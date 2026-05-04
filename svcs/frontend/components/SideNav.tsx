"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Exported so DashboardShell can reuse the same list for the mobile drop-down
// menu — keeps "what counts as primary navigation" defined in one place.
export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (
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
    ),
  },
  {
    href: "/dashboard/my-videos",
    label: "My videos",
    icon: (
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
    ),
  },
];

export default function SideNav({ expanded }: { expanded: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mt-2 flex-1 px-2">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
    </nav>
  );
}
