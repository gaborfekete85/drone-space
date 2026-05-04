"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
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
        className="h-5 w-5"
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
        className="h-5 w-5"
        aria-hidden
      >
        <rect x="3" y="5" width="15" height="14" rx="2" />
        <path d="M21 8.5l-5 3.5 5 3.5v-7z" />
      </svg>
    ),
  },
];

export default function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
                    (active
                      ? "bg-brand-50 text-brand-700 dark:bg-orange-500/15 dark:text-orange-400"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white")
                  }
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
