"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  path: string; // current folder, e.g. "2026/malaga"
  onUploaded: () => void;
};

type DroneOption = {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
};

type FormState = {
  location: string;
  latitude: string;
  longitude: string;
  height: string;
  tags: string;
  takenAt: string;
  droneId: string;
};

const EMPTY_FORM: FormState = {
  location: "",
  latitude: "",
  longitude: "",
  height: "",
  tags: "",
  takenAt: "",
  droneId: "",
};

export default function UploadVideoModal({
  open,
  onClose,
  userId,
  path,
  onUploaded,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drones, setDrones] = useState<DroneOption[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Load the user's drones each time the modal opens — they may have just
  // added one in another tab.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/backend/drones?user_id=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((j) => {
        if (cancelled) return;
        const list: DroneOption[] = (j.drones ?? []).map((d: DroneOption) => ({
          id: d.id,
          brand: d.brand,
          model: d.model,
          nickname: d.nickname,
        }));
        setDrones(list);
        // Auto-select the only drone — the user shouldn't have to pick when
        // there's no choice.
        if (list.length === 1) {
          setForm((s) => (s.droneId ? s : { ...s, droneId: list[0].id }));
        }
      })
      .catch(() => {
        if (!cancelled) setDrones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setCover(null);
      setCoverPreview(null);
      setForm(EMPTY_FORM);
      setBusy(false);
      setProgress(0);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!cover) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  function pickFile(f: File | null) {
    if (!f) return;
    // Backend currently accepts mp4 only — keep the client check in sync so
    // the user gets a clear message instead of a 415 from the API.
    if (f.type !== "video/mp4" && !/\.mp4$/i.test(f.name)) {
      setError("Please choose an .mp4 file (only mp4 is supported).");
      return;
    }
    setError(null);
    setFile(f);
  }

  function pickCover(f: File | null) {
    if (!f) return;
    if (!/\.(jpe?g)$/i.test(f.name) && f.type !== "image/jpeg") {
      setError("Cover photo must be a .jpg / .jpeg image.");
      return;
    }
    setError(null);
    setCover(f);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function submit() {
    if (!file) {
      setError("Choose a video first.");
      return;
    }
    if (!form.droneId) {
      setError("Pick a drone — register one if you haven't yet.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);

    const metadata = {
      location: form.location.trim() || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      height_m: form.height ? Number(form.height) : null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      taken_at: form.takenAt || null,
      drone_id: form.droneId || null,
    };

    try {
      // Step 1 — reserve the filename and get a presigned PUT URL. Tiny
      // request; if the server doesn't support direct uploads (volume mode)
      // we fall through to the legacy multipart endpoint.
      const initRes = await fetch("/api/backend/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          path,
          filename: file.name,
          drone_id: form.droneId,
        }),
      });
      if (initRes.status === 501) {
        await uploadLegacy(file, cover, metadata);
        return;
      }
      if (!initRes.ok) {
        const j = await initRes.json().catch(() => ({}));
        throw new Error(j.detail ?? `init failed (${initRes.status})`);
      }
      const init = (await initRes.json()) as {
        final_name: string;
        presigned_url: string;
      };

      // Step 2 — PUT bytes directly to S3 via XHR so we can track progress.
      // This is the big one; legacy proxy timeouts on the way to the Python
      // backend don't apply since the request bypasses it entirely.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", init.presigned_url);
        // Match the file's MIME so S3 stores a useful Content-Type.
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(
              new Error(
                `S3 upload failed (${xhr.status}). If this is a CORS error, configure the bucket to allow PUT from this origin.`
              )
            );
        };
        xhr.onerror = () => reject(new Error("network error during S3 PUT"));
        xhr.send(file);
      });

      // Step 3 — finalize: backend HEADs the S3 object, writes the cover +
      // meta sidecars, inserts the DB row.
      const fd = new FormData();
      fd.append("user_id", userId);
      fd.append("path", path);
      fd.append("final_name", init.final_name);
      fd.append("metadata", JSON.stringify(metadata));
      if (cover) fd.append("cover", cover);
      const finRes = await fetch("/api/backend/upload/finalize", {
        method: "POST",
        body: fd,
      });
      if (!finRes.ok) {
        const j = await finRes.json().catch(() => ({}));
        throw new Error(j.detail ?? `finalize failed (${finRes.status})`);
      }

      onUploaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Volume-mode fallback — proxies bytes through the backend the old way.
  // Only reachable when /api/upload/init returns 501.
  async function uploadLegacy(
    file: File,
    cover: File | null,
    metadata: Record<string, unknown>
  ) {
    const fd = new FormData();
    fd.append("user_id", userId);
    fd.append("path", path);
    fd.append("file", file);
    if (cover) fd.append("cover", cover);
    fd.append("metadata", JSON.stringify(metadata));

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/backend/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          try {
            const j = JSON.parse(xhr.responseText);
            reject(new Error(j.detail ?? `upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`upload failed (${xhr.status})`));
          }
        }
      };
      xhr.onerror = () => reject(new Error("network error"));
      xhr.send(fd);
    });
    onUploaded();
    onClose();
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
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Upload a video
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Destination:{" "}
              <span className="font-mono">/{path || ""}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition " +
              (dragOver
                ? "border-brand-500 bg-brand-50 dark:border-orange-400 dark:bg-orange-500/10"
                : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-orange-400/60 dark:hover:bg-orange-500/5")
            }
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand-500 dark:text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {file ? (
              <div className="text-sm">
                <p className="font-medium text-slate-900 dark:text-white">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB · click to change
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Drop a video here, or click to browse
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  mp4 only
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,.mp4"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-400/60 dark:hover:text-orange-400"
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Cover photo <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saved as <span className="font-mono">{file ? file.name.replace(/\.[^.]+$/, "") : "<video>"}_cover.jpg</span>. JPG / JPEG only.
              </p>
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  className="mt-1 self-start text-xs font-medium text-brand-600 hover:underline dark:text-orange-400"
                >
                  Remove cover
                </button>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              hidden
              onChange={(e) => pickCover(e.target.files?.[0] ?? null)}
            />
          </div>

          {drones !== null && drones.length === 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">You haven't added any drones yet.</p>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
                You need to register the device you flew with before uploading
                footage.
              </p>
              <Link
                href="/dashboard/drones"
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add your drone
              </Link>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Drone *">
                <select
                  value={form.droneId}
                  onChange={(e) => update("droneId", e.target.value)}
                  disabled={!drones || drones.length === 0}
                  className={inputCls + " disabled:opacity-60"}
                >
                  <option value="">
                    {drones === null
                      ? "Loading…"
                      : drones.length === 0
                        ? "No drones registered"
                        : "Select a drone"}
                  </option>
                  {(drones ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.brand} {d.model}
                      {d.nickname ? ` · "${d.nickname}"` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Location">
              <input
                type="text"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Malaga, Spain"
                className={inputCls}
              />
            </Field>
            <Field label="Flying date">
              <input
                type="datetime-local"
                value={form.takenAt}
                onChange={(e) => update("takenAt", e.target.value)}
                className={inputCls}
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                When the footage was actually shot.
              </span>
            </Field>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
              <Field label="Latitude">
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => update("latitude", e.target.value)}
                  placeholder="36.7213"
                  className={inputCls}
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => update("longitude", e.target.value)}
                  placeholder="-4.4214"
                  className={inputCls}
                />
              </Field>
              <Field label="Height (meters)">
                <input
                  type="number"
                  step="any"
                  value={form.height}
                  onChange={(e) => update("height", e.target.value)}
                  placeholder="120"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Tags (comma-separated)">
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => update("tags", e.target.value)}
                  placeholder="coast, sunset, cinematic"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          {busy && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-brand-500 transition-all dark:bg-orange-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Uploading… {progress}%
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
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
            disabled={busy || !file || !form.droneId}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
