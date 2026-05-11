"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_MS = 60 * 60 * 1000; // 1 hour

export type LocationState = {
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "idle" | "loading" | "ready" | "denied" | "error";
  error: string | null;
};

const initial: LocationState = {
  label: null,
  latitude: null,
  longitude: null,
  status: "idle",
  error: null,
};

async function reverseGeocode(
  lat: number,
  lng: number,
  signal: AbortSignal
): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "10");
  const res = await fetch(url.toString(), {
    signal,
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  const a = j.address ?? {};
  const city =
    a.city || a.town || a.village || a.hamlet || a.suburb || a.county || null;
  const country = a.country || null;
  if (city && country) return `${city}, ${country}`;
  return city || country || j.display_name || null;
}

export function useUserLocation(userId: string | null | undefined): LocationState {
  const [state, setState] = useState<LocationState>(initial);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    aborter.current?.abort();
    const ctrl = new AbortController();
    aborter.current = ctrl;

    // Seed from server-cached profile so the header isn't empty while we wait
    // for geolocation to resolve (or for the user to grant permission).
    fetch(`/api/backend/profile?user_id=${encodeURIComponent(userId)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.profile) return;
        setState((s) => ({
          ...s,
          label: j.profile.location_label ?? s.label,
          latitude: j.profile.latitude ?? s.latitude,
          longitude: j.profile.longitude ?? s.longitude,
          status: s.status === "idle" ? "loading" : s.status,
        }));
      })
      .catch(() => undefined);

    async function sample() {
      if (!("geolocation" in navigator)) {
        setState((s) => ({ ...s, status: "error", error: "no geolocation" }));
        return;
      }
      setState((s) => ({ ...s, status: "loading", error: null }));
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          (err) => {
            if (cancelled) return;
            setState((s) => ({
              ...s,
              status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
              error: err.message,
            }));
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 }
        );
      });
      if (!pos || cancelled) return;
      const { latitude, longitude } = pos.coords;
      let label: string | null = null;
      try {
        label = await reverseGeocode(latitude, longitude, ctrl.signal);
      } catch {
        // Reverse geocoding is best-effort; fall through with null label.
      }
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/backend/profile/location?user_id=${encodeURIComponent(userId!)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude, label }),
            signal: ctrl.signal,
          }
        );
        if (res.ok) {
          const j = await res.json();
          if (!cancelled && j?.profile) {
            setState({
              label: j.profile.location_label ?? null,
              latitude: j.profile.latitude ?? null,
              longitude: j.profile.longitude ?? null,
              status: "ready",
              error: null,
            });
            return;
          }
        }
      } catch {
        // Network blip — keep what we have, mark ready locally.
      }
      if (!cancelled) {
        setState({ label, latitude, longitude, status: "ready", error: null });
      }
    }

    sample();
    const t = setInterval(sample, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
      ctrl.abort();
    };
  }, [userId]);

  return state;
}
