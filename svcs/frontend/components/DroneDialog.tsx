"use client";

import { useEffect, useRef, useState } from "react";

export type DroneType = "video" | "fpv";
export type DroneStatus = "OWNED" | "SELLING";
export type Currency =
  | "EUR"
  | "USD"
  | "GBP"
  | "CHF"
  | "SEK"
  | "NOK"
  | "DKK"
  | "PLN"
  | "HUF"
  | "CZK";

export type Drone = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  drone_type: DroneType;
  nickname: string | null;
  max_flight_time_min: number | null;
  year_acquired: number | null;
  notes: string | null;
  photo_filename: string | null;
  has_photo: boolean;
  status: DroneStatus;
  sale_price: number | null;
  sale_currency: Currency | null;
  listed_at: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** Existing drone for edit mode; null for create. */
  drone: Drone | null;
  onSaved: () => void;
};

type FormState = {
  brand: string;
  model: string;
  droneType: DroneType;
  nickname: string;
  maxFlight: string;
  year: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  brand: "",
  model: "",
  droneType: "video",
  nickname: "",
  maxFlight: "",
  year: "",
  notes: "",
};

function fromDrone(d: Drone | null): FormState {
  if (!d) return EMPTY_FORM;
  return {
    brand: d.brand ?? "",
    model: d.model ?? "",
    droneType: d.drone_type ?? "video",
    nickname: d.nickname ?? "",
    maxFlight:
      d.max_flight_time_min != null ? String(d.max_flight_time_min) : "",
    year: d.year_acquired != null ? String(d.year_acquired) : "",
    notes: d.notes ?? "",
  };
}

export default function DroneDialog({
  open,
  onClose,
  userId,
  drone,
  onSaved,
}: Props) {
  const isEdit = drone !== null;
  const [form, setForm] = useState<FormState>(fromDrone(drone));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(fromDrone(drone));
      setPhoto(null);
      setPhotoPreview(null);
      setRemovePhoto(false);
      setError(null);
      setBusy(false);
    }
  }, [open, drone]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function pickPhoto(f: File | null) {
    if (!f) return;
    if (!/\.(jpe?g|png|webp)$/i.test(f.name)) {
      setError("Photo must be jpg, jpeg, png, or webp.");
      return;
    }
    setError(null);
    setPhoto(f);
    setRemovePhoto(false);
  }

  async function submit() {
    if (!form.brand.trim() || !form.model.trim()) {
      setError("Brand and model are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("brand", form.brand.trim());
      fd.append("model", form.model.trim());
      fd.append("drone_type", form.droneType);
      fd.append("nickname", form.nickname.trim());
      fd.append("max_flight_time_min", form.maxFlight.trim());
      fd.append("year_acquired", form.year.trim());
      fd.append("notes", form.notes.trim());
      if (photo) fd.append("photo", photo);
      if (isEdit && removePhoto && !photo) fd.append("remove_photo", "1");
      if (!isEdit) fd.append("user_id", userId);

      const url = isEdit
        ? `/api/backend/drones/${encodeURIComponent(drone!.id)}?user_id=${encodeURIComponent(userId)}`
        : "/api/backend/drones";

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30";

  const existingPhotoUrl =
    isEdit && drone?.has_photo && !removePhoto && !photo
      ? `/api/backend/drones/${encodeURIComponent(drone.id)}/photo?user_id=${encodeURIComponent(userId)}&t=${encodeURIComponent(drone.updated_at)}`
      : null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEdit ? "Edit drone" : "Add a drone"}
          </h2>
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

        <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
          <div className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-400/60 dark:hover:text-orange-400"
            >
              {photoPreview || existingPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview ?? existingPhotoUrl ?? ""}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Photo <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                jpg, jpeg, png, or webp.
              </p>
              <div className="mt-1 flex gap-3">
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-orange-400"
                  >
                    Discard new photo
                  </button>
                )}
                {isEdit && drone?.has_photo && !photo && !removePhoto && (
                  <button
                    type="button"
                    onClick={() => setRemovePhoto(true)}
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove current photo
                  </button>
                )}
                {removePhoto && (
                  <button
                    type="button"
                    onClick={() => setRemovePhoto(false)}
                    className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
                  >
                    Cancel removal
                  </button>
                )}
              </div>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              hidden
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand *">
              <input
                type="text"
                value={form.brand}
                onChange={(e) => update("brand", e.target.value)}
                placeholder="DJI"
                className={inputCls}
              />
            </Field>
            <Field label="Model *">
              <input
                type="text"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="Mavic 3 Pro"
                className={inputCls}
              />
            </Field>
            <Field label="Drone type *">
              <select
                value={form.droneType}
                onChange={(e) => update("droneType", e.target.value as DroneType)}
                className={inputCls}
              >
                <option value="video">Video drone</option>
                <option value="fpv">FPV drone</option>
              </select>
            </Field>
            <Field label="Nickname">
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder="Big Bird"
                className={inputCls}
              />
            </Field>
            <Field label="Max flight time (min)">
              <input
                type="number"
                step="1"
                value={form.maxFlight}
                onChange={(e) => update("maxFlight", e.target.value)}
                placeholder="43"
                className={inputCls}
              />
            </Field>
            <Field label="Year acquired">
              <input
                type="number"
                step="1"
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
                placeholder="2024"
                className={inputCls}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Anything you want to remember about this drone."
                  rows={3}
                  className={inputCls + " resize-y"}
                />
              </Field>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
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
            onClick={submit}
            disabled={busy || !form.brand.trim() || !form.model.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            {busy ? "Saving…" : isEdit ? "Save" : "Add drone"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
