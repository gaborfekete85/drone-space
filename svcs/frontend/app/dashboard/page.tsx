import { currentUser } from "@clerk/nextjs/server";
import VideoExplorer from "@/components/VideoExplorer";

export default async function DashboardHome() {
  const user = await currentUser();
  const name =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "pilot";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-orange-400">
            Mission control
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Welcome back, {name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Discover aerial footage tagged to GPS coordinates from creators
            around the world. Filter by date, location, or runtime to narrow
            in on a flight.
          </p>
        </div>
      </header>

      <VideoExplorer />
    </div>
  );
}
