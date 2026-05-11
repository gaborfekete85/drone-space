"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import DroneDialog, { type Drone } from "./DroneDialog";
import SellDroneDialog, { formatPrice } from "./SellDroneDialog";

export default function MyDrones({ userId }: { userId: string }) {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Drone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Drone | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sellTarget, setSellTarget] = useState<Drone | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/backend/drones?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`failed to load (${res.status})`);
      const j = await res.json();
      setDrones(j.drones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load drones");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function startCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function startEdit(d: Drone) {
    setEditing(d);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/backend/drones/${encodeURIComponent(deleteTarget.id)}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            My drones
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Register the devices you fly with so you can attach them to your
            videos.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add drone
        </button>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && drones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Loading…
        </div>
      ) : drones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No drones registered yet.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            Add your first drone
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drones.map((d) => (
            <DroneCard
              key={d.id}
              drone={d}
              userId={userId}
              onEdit={() => startEdit(d)}
              onDelete={() => setDeleteTarget(d)}
              onSell={() => setSellTarget(d)}
            />
          ))}
        </ul>
      )}

      <DroneDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        userId={userId}
        drone={editing}
        onSaved={refresh}
      />

      <SellDroneDialog
        open={sellTarget !== null}
        onClose={() => setSellTarget(null)}
        userId={userId}
        drone={sellTarget}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete drone"
        message={
          <>
            Delete{" "}
            <strong className="font-semibold text-slate-900 dark:text-white">
              {deleteTarget
                ? `${deleteTarget.brand} ${deleteTarget.model}`
                : ""}
            </strong>
            ? Videos linked to this drone will keep their footage but lose the
            link.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        busy={deleteBusy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function DroneCard({
  drone,
  userId,
  onEdit,
  onDelete,
  onSell,
}: {
  drone: Drone;
  userId: string;
  onEdit: () => void;
  onDelete: () => void;
  onSell: () => void;
}) {
  const isListed = drone.status === "SELLING";
  const photoUrl = drone.has_photo
    ? `/api/backend/drones/${encodeURIComponent(drone.id)}/photo?user_id=${encodeURIComponent(userId)}&t=${encodeURIComponent(drone.updated_at)}`
    : null;
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        {isListed && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
            For sale
          </span>
        )}
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`${drone.brand} ${drone.model}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-slate-400 dark:text-slate-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5" cy="5" r="2" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="19" r="2" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
            <path d="M7 5h10M7 19h10M5 7v10M19 7v10" />
          </svg>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-slate-900 dark:text-white">
                {drone.brand} {drone.model}
              </h3>
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {drone.drone_type === "fpv" ? "FPV" : "Video"}
              </span>
            </div>
            {drone.nickname && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                "{drone.nickname}"
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit drone"
              title="Edit"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete drone"
              title="Delete"
              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          {drone.max_flight_time_min != null && (
            <div>
              <dt className="inline text-slate-500 dark:text-slate-400">Max flight: </dt>
              <dd className="inline text-slate-700 dark:text-slate-200">{drone.max_flight_time_min} min</dd>
            </div>
          )}
          {drone.year_acquired != null && (
            <div className="col-span-2">
              <dt className="inline text-slate-500 dark:text-slate-400">Acquired: </dt>
              <dd className="inline text-slate-700 dark:text-slate-200">{drone.year_acquired}</dd>
            </div>
          )}
          {drone.notes && (
            <div className="col-span-2 text-[11px] text-slate-500 dark:text-slate-500">
              {drone.notes}
            </div>
          )}
        </dl>
        <button
          type="button"
          onClick={onSell}
          className={
            "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition " +
            (isListed
              ? "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700")
          }
        >
          {isListed && drone.sale_price != null && drone.sale_currency
            ? `Listed at ${formatPrice(drone.sale_price, drone.sale_currency)}`
            : "Ready to sell"}
        </button>
      </div>
    </li>
  );
}
