import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import SideNav from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur px-4 sm:px-6 h-14 dark:border-slate-800 dark:bg-slate-900/80">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white dark:bg-orange-500">
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
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        <SideNav />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        &copy; {new Date().getFullYear()} DroneSpace — Aerial footage, mapped to
        the world.
      </footer>
    </div>
  );
}
