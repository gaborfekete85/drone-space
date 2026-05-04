"use client";

import { useMemo, useState } from "react";

type Video = {
  id: string;
  title: string;
  creator: string;
  location: string;
  coords: string;
  date: string;
  lengthSeconds: number;
  rating: number;
  views: number;
  thumbnail: string;
};

const SAMPLE_VIDEOS: Video[] = [
  {
    id: "1",
    title: "Dolomites at Golden Hour",
    creator: "alpine.eye",
    location: "Dolomites, Italy",
    coords: "46.4102° N, 11.8440° E",
    date: "2026-04-30",
    lengthSeconds: 412,
    rating: 4.8,
    views: 12453,
    thumbnail:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "2",
    title: "Cinque Terre Coastline",
    creator: "skyfish",
    location: "Cinque Terre, Italy",
    coords: "44.1099° N, 9.7311° E",
    date: "2026-04-22",
    lengthSeconds: 95,
    rating: 4.6,
    views: 8910,
    thumbnail:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "3",
    title: "Lofoten Winter Fjords",
    creator: "north.lens",
    location: "Lofoten, Norway",
    coords: "68.2110° N, 14.5510° E",
    date: "2026-04-12",
    lengthSeconds: 238,
    rating: 4.9,
    views: 21034,
    thumbnail:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "4",
    title: "Autumn Above the Carpathians",
    creator: "leafdrone",
    location: "Carpathians, Romania",
    coords: "45.3650° N, 25.5510° E",
    date: "2026-03-28",
    lengthSeconds: 178,
    rating: 4.4,
    views: 5421,
    thumbnail:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "5",
    title: "Atacama Milky Way",
    creator: "wing.south",
    location: "Atacama, Chile",
    coords: "23.6509° S, 70.3975° W",
    date: "2026-02-15",
    lengthSeconds: 524,
    rating: 4.7,
    views: 17820,
    thumbnail:
      "https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "6",
    title: "Toronto After Hours",
    creator: "coast.frame",
    location: "Toronto, Canada",
    coords: "43.6532° N, 79.3832° W",
    date: "2025-12-04",
    lengthSeconds: 312,
    rating: 4.5,
    views: 31245,
    thumbnail:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=900&q=80",
  },
];

function formatLength(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function ageLabel(date: string) {
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${Math.floor(days)} days ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default function VideoExplorer() {
  const [made, setMade] = useState("any");
  const [location, setLocation] = useState("");
  const [length, setLength] = useState("any");

  const filtered = useMemo(() => {
    return SAMPLE_VIDEOS.filter((v) => {
      if (
        location.trim() &&
        !v.location.toLowerCase().includes(location.trim().toLowerCase())
      ) {
        return false;
      }
      if (made !== "any") {
        const days = parseInt(made, 10);
        const ageDays =
          (Date.now() - new Date(v.date).getTime()) / 86_400_000;
        if (ageDays > days) return false;
      }
      if (length === "short" && v.lengthSeconds > 120) return false;
      if (
        length === "medium" &&
        (v.lengthSeconds <= 120 || v.lengthSeconds > 300)
      ) {
        return false;
      }
      if (length === "long" && v.lengthSeconds <= 300) return false;
      return true;
    });
  }, [location, made, length]);

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30";

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Made at" icon={<CalendarIcon />}>
            <select
              value={made}
              onChange={(e) => setMade(e.target.value)}
              className={inputClass}
            >
              <option value="any">Any time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 3 months</option>
              <option value="365">Last year</option>
            </select>
          </Field>

          <Field label="Location" icon={<PinIcon />}>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, region or country…"
              className={inputClass}
            />
          </Field>

          <Field label="Movie length" icon={<ClockIcon />}>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className={inputClass}
            >
              <option value="any">Any length</option>
              <option value="short">Short · under 2 min</option>
              <option value="medium">Medium · 2 – 5 min</option>
              <option value="long">Long · over 5 min</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {filtered.length} aerial {filtered.length === 1 ? "video" : "videos"}
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Sample footage · curated
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No videos match those filters yet.
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span className="text-brand-500 dark:text-orange-400">{icon}</span>
        {label}
      </span>
      {children}
    </label>
  );
}

function VideoCard({ video }: { video: Video }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-orange-500/20">
      <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {formatLength(video.lengthSeconds)}
        </span>

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <PinIcon className="h-3 w-3" />
          {video.location.split(",")[0]}
        </span>

        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow-lg ring-1 ring-black/10 dark:bg-orange-500 dark:text-white dark:ring-white/20">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-0.5 h-6 w-6"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
          {video.title}
        </h3>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            by{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {video.creator}
            </span>
          </span>
          <span>{ageLabel(video.date)}</span>
        </div>

        <div className="flex items-center gap-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <StarIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {video.rating.toFixed(1)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <EyeIcon className="h-3.5 w-3.5" />
            {formatViews(video.views)}
          </span>
          <span className="ml-auto truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {video.coords}
          </span>
        </div>
      </div>
    </article>
  );
}

function CalendarIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ClockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function StarIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function EyeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
