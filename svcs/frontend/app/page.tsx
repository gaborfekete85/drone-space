import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import DroneIcon from "@/components/DroneIcon";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Layer 1: animated drone-over-misty-forest background */}
      <div className="drone-bg-anim absolute inset-0" aria-hidden />

      {/* Layer 2: drifting mist bands */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="mist-band mist-band--top" />
        <div className="mist-band mist-band--bottom" />
      </div>

      {/* Layer 3: dark gradient overlay for legibility */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-slate-950/70"
        aria-hidden
      />

      {/* Flying drone animations */}
      <div className="drone-flyer pointer-events-none" aria-hidden>
        <div className="drone-bob">
          <DroneIcon className="w-12 h-12 text-white/80" />
        </div>
      </div>
      <div className="drone-flyer drone-flyer--lower pointer-events-none" aria-hidden>
        <div className="drone-bob">
          <DroneIcon className="w-8 h-8 text-white/60" />
        </div>
      </div>

      {/* Hero content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <DroneIcon className="w-12 h-12 text-white drop-shadow-lg" />
          <span className="text-3xl font-bold text-white tracking-tight drop-shadow-lg">
            DroneSpace
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-tight drop-shadow-xl max-w-3xl">
          Aerial footage,{" "}
          <span className="text-sky-300">mapped to the world</span>
        </h1>

        <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-xl drop-shadow">
          Upload, discover and rate drone videos by GPS location. Find stunning
          aerial shots from creators around the globe.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link
            href="/sign-in"
            className="px-8 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg shadow-lg transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="px-8 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/40 text-white font-semibold text-lg backdrop-blur-sm transition-colors"
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
