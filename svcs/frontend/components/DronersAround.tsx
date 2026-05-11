"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UserBadge from "./UserBadge";

type NearbyUser = {
  user_id: string;
  latitude: number;
  longitude: number;
  location_label: string | null;
  distance_km: number;
};

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

const MIN_KM = 1;
const MAX_KM = 1000;
const DEFAULT_KM = 10;
const DEBOUNCE_MS = 250;

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function DronersAround({ userId }: { userId: string }) {
  const [radiusKm, setRadiusKm] = useState(DEFAULT_KM);
  const [debouncedRadius, setDebouncedRadius] = useState(DEFAULT_KM);
  const [nearby, setNearby] = useState<NearbyUser[]>([]);
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingLocation, setMissingLocation] = useState(false);

  // Debounce the slider — drag generates a stream of events; we only want
  // to fire one fetch when the value settles.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRadius(radiusKm), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [radiusKm]);

  // Fetch the Clerk-resolved user list once. We merge by user_id locally so
  // the nearby endpoint can stay backend-only (no Clerk dep).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`/api/users ${r.status}`))))
      .then((j) => {
        if (!cancelled) setUsers(j.users ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load users");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Confirm we have an anchor location before asking the server. The
      // nearby endpoint returns [] either way, but distinguishing empty-radius
      // from missing-anchor lets us show a clearer message.
      const profileRes = await fetch(
        `/api/backend/profile?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      const profileJson = profileRes.ok ? await profileRes.json() : null;
      const hasLocation =
        profileJson?.profile?.latitude != null &&
        profileJson?.profile?.longitude != null;
      setMissingLocation(!hasLocation);

      const res = await fetch(
        `/api/backend/users/nearby?user_id=${encodeURIComponent(
          userId
        )}&radius_km=${debouncedRadius}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j = await res.json();
      setNearby(j.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load nearby users");
    } finally {
      setLoading(false);
    }
  }, [userId, debouncedRadius]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usersById = useMemo(() => {
    const m = new Map<string, ShareableUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Droners around me
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pilots within range of your last reported location.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="radius-slider"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            Search radius
          </label>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-orange-500/15 dark:text-orange-400">
            {formatDistance(radiusKm)}
          </span>
        </div>
        <input
          id="radius-slider"
          type="range"
          min={MIN_KM}
          max={MAX_KM}
          step={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="mt-3 w-full accent-brand-600 dark:accent-orange-500"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>{MIN_KM} km</span>
          <span>{MAX_KM} km</span>
        </div>
      </section>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {missingLocation ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            We don't have your location yet — grant the browser's location
            permission and the page in the header will start showing your city.
            Once that's set, refresh here.
          </p>
        </div>
      ) : loading && nearby.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Loading…
        </div>
      ) : nearby.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No droners within {formatDistance(debouncedRadius)} of you.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {nearby.map((n) => {
            const u = usersById.get(n.user_id);
            const email = u?.email ?? "";
            return (
              <li
                key={n.user_id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <UserBadge
                    user={{
                      id: n.user_id,
                      name: u?.name,
                      email: u?.email,
                      imageUrl: u?.imageUrl,
                    }}
                    currentUserId={userId}
                    size={36}
                    className="text-sm"
                  />
                  {(email || n.location_label) && (
                    <div className="ml-[44px] truncate text-xs text-slate-500 dark:text-slate-400">
                      {email}
                      {email && n.location_label ? " · " : ""}
                      {n.location_label}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {formatDistance(n.distance_km)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
