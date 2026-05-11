"use client";

import { useEffect, useState } from "react";
import type { Currency, Drone } from "./DroneDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  drone: Drone | null;
  onSaved: () => void;
};

export const CURRENCIES: { code: Currency; label: string; symbol: string }[] = [
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", label: "Danish Krone", symbol: "kr" },
  { code: "PLN", label: "Polish Złoty", symbol: "zł" },
  { code: "HUF", label: "Hungarian Forint", symbol: "Ft" },
  { code: "CZK", label: "Czech Koruna", symbol: "Kč" },
];

export function formatPrice(price: number, currency: Currency): string {
  // Use the user's locale for thousands separators / decimal style. The
  // currency code is the platform-neutral representation; Intl picks an
  // appropriate symbol based on the locale.
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export default function SellDroneDialog({
  open,
  onClose,
  userId,
  drone,
  onSaved,
}: Props) {
  const isListed = drone?.status === "SELLING";

  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && drone) {
      setPrice(drone.sale_price != null ? String(drone.sale_price) : "");
      setCurrency(drone.sale_currency ?? "EUR");
      setError(null);
      setBusy(false);
    }
  }, [open, drone]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !drone) return null;

  async function listForSale() {
    if (!drone) return;
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p <= 0) {
      setError("Enter a positive price.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/drones/${encodeURIComponent(drone.id)}/list?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price: p, currency }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "list failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlist() {
    if (!drone) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/drones/${encodeURIComponent(drone.id)}/list?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unlist failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30";

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {isListed ? "Update listing" : "Ready to sell"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {drone.brand} {drone.model}
              {drone.nickname ? ` · "${drone.nickname}"` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Price
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1200"
                className={inputCls}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Currency
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className={inputCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isListed && drone.listed_at && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Currently listed since{" "}
              {new Date(drone.listed_at).toLocaleDateString()}.
            </p>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          {isListed ? (
            <button
              type="button"
              onClick={unlist}
              disabled={busy}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              Stop selling
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={listForSale}
              disabled={busy || !price.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
            >
              {busy
                ? "Saving…"
                : isListed
                  ? "Update price"
                  : "List for sale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
