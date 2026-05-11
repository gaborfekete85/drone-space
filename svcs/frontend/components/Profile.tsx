"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NewMessageDialog from "./NewMessageDialog";

type SocialLinks = Partial<Record<SocialPlatform, string>>;

type Profile = {
  user_id: string;
  display_name: string | null;
  nickname: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  social_links: SocialLinks;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  has_profile_image: boolean;
  updated_at: string;
};

function profilePhotoUrl(targetUserId: string, currentUserId: string, updatedAt: string): string {
  // updatedAt is the cache-buster — when the user replaces their photo the
  // backend bumps updated_at, which forces the browser to fetch the new image.
  return `/api/backend/profile/${encodeURIComponent(targetUserId)}/photo?user_id=${encodeURIComponent(currentUserId)}&t=${encodeURIComponent(updatedAt)}`;
}

type ShareableUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

type SocialPlatform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "linkedin"
  | "website";

type SocialMeta = {
  key: SocialPlatform;
  label: string;
  placeholder: string;
};

const SOCIAL_PLATFORMS: SocialMeta[] = [
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/…" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "website", label: "Website", placeholder: "https://…" },
];

type Props = {
  /** The Clerk userId of the profile being viewed. */
  targetUserId: string;
  /** The Clerk userId of the signed-in user. */
  currentUserId: string;
};

export default function Profile({ targetUserId, currentUserId }: Props) {
  const isOwn = targetUserId === currentUserId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [clerkUser, setClerkUser] = useState<ShareableUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, usersRes] = await Promise.all([
        fetch(`/api/backend/profile?user_id=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        }),
        fetch("/api/users", { cache: "no-store" }),
      ]);
      const j1 = await profileRes.json();
      setProfile((j1.profile as Profile | null) ?? null);
      if (usersRes.ok) {
        const j2 = await usersRes.json();
        const u = (j2.users as ShareableUser[] | undefined)?.find(
          (x) => x.id === targetUserId
        );
        setClerkUser(u ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && profile === null && clerkUser === null) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Loading…
      </div>
    );
  }

  if (isOwn) {
    return (
      <ProfileEditor
        targetUserId={targetUserId}
        clerkUser={clerkUser}
        profile={profile}
        onSaved={(p) => setProfile(p)}
        error={error}
      />
    );
  }
  return (
    <PublicProfile
      currentUserId={currentUserId}
      targetUserId={targetUserId}
      clerkUser={clerkUser}
      profile={profile}
      error={error}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared UI bits
// ---------------------------------------------------------------------------

function Avatar({
  src,
  user,
  size = 96,
  fallback,
}: {
  /** Custom image URL — wins over the Clerk image. */
  src?: string | null;
  user: ShareableUser | null;
  size?: number;
  fallback?: string;
}) {
  const url = src || user?.imageUrl || "";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const seed = user?.name || fallback || "?";
  const initials = seed
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

function effectiveName(profile: Profile | null, clerk: ShareableUser | null) {
  return profile?.display_name || clerk?.name || clerk?.email || "Pilot";
}

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  // Generic external-link icon — keeps the bundle small and matches the
  // rest of the app's stroke style.
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={platform}
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Editor (own profile)
// ---------------------------------------------------------------------------

type FormState = {
  display_name: string;
  nickname: string;
  description: string;
  country: string;
  city: string;
  social: Record<SocialPlatform, string>;
};

const EMPTY_SOCIAL: Record<SocialPlatform, string> = {
  youtube: "",
  instagram: "",
  tiktok: "",
  x: "",
  facebook: "",
  linkedin: "",
  website: "",
};

function fromProfile(p: Profile | null, fallbackName: string): FormState {
  return {
    display_name: p?.display_name ?? fallbackName ?? "",
    nickname: p?.nickname ?? "",
    description: p?.description ?? "",
    country: p?.country ?? "",
    city: p?.city ?? "",
    social: { ...EMPTY_SOCIAL, ...((p?.social_links ?? {}) as Record<SocialPlatform, string>) },
  };
}

function ProfileEditor({
  targetUserId,
  clerkUser,
  profile,
  onSaved,
  error,
}: {
  targetUserId: string;
  clerkUser: ShareableUser | null;
  profile: Profile | null;
  onSaved: (p: Profile) => void;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(() =>
    fromProfile(profile, clerkUser?.name ?? "")
  );
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const customAvatarUrl =
    profile?.has_profile_image && profile?.updated_at
      ? profilePhotoUrl(targetUserId, targetUserId, profile.updated_at)
      : null;

  // When the parent loads the profile after mount, sync it in.
  useEffect(() => {
    setForm(fromProfile(profile, clerkUser?.name ?? ""));
  }, [profile, clerkUser]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
    setSaved(false);
  }

  function setSocial(platform: SocialPlatform, value: string) {
    setForm((s) => ({ ...s, social: { ...s.social, [platform]: value } }));
    setSaved(false);
  }

  async function uploadPhoto(file: File) {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setLocalError("Photo must be jpg, jpeg, png, or webp.");
      return;
    }
    setPhotoBusy(true);
    setLocalError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(
        `/api/backend/profile/photo?user_id=${encodeURIComponent(targetUserId)}`,
        { method: "POST", body: fd }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j = await res.json();
      onSaved(j.profile as Profile);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setLocalError(null);
    try {
      const res = await fetch(
        `/api/backend/profile/photo?user_id=${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j = await res.json();
      onSaved(j.profile as Profile);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setLocalError(null);
    setSaved(false);
    try {
      // Drop empty values so we don't store {"youtube": ""} rows.
      const cleanedSocial: Record<string, string> = {};
      for (const [k, v] of Object.entries(form.social)) {
        const trimmed = v.trim();
        if (trimmed) cleanedSocial[k] = trimmed;
      }
      const res = await fetch(
        `/api/backend/profile?user_id=${encodeURIComponent(targetUserId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: form.display_name.trim() || null,
            nickname: form.nickname.trim() || null,
            description: form.description.trim() || null,
            country: form.country.trim() || null,
            city: form.city.trim() || null,
            social_links: cleanedSocial,
          }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? `failed (${res.status})`);
      }
      const j = await res.json();
      onSaved(j.profile as Profile);
      setSaved(true);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-orange-400 dark:focus:ring-orange-400/30";

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
            aria-label="Change profile photo"
            title="Change profile photo"
            className="group/photo relative block h-16 w-16 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:focus:ring-orange-400/40"
          >
            <span className="block h-full w-full overflow-hidden rounded-full">
              <Avatar
                src={customAvatarUrl}
                user={clerkUser}
                fallback={form.display_name}
                size={64}
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/0 text-[10px] font-semibold uppercase tracking-wide text-transparent transition group-hover/photo:bg-slate-900/60 group-hover/photo:text-white">
                Change
              </span>
            </span>
            {/* + badge: sits outside the round avatar so it's always visible
                even when no hover. Bumps slightly on hover so it feels live. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-md transition-transform group-hover/photo:scale-110 dark:border-slate-900 dark:bg-orange-500"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhoto(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Your profile
          </h1>
          <UserIdChip userId={targetUserId} />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            What other pilots see when they open your profile.{" "}
            {photoBusy
              ? "Uploading photo…"
              : profile?.has_profile_image
                ? "Click your photo to replace it."
                : "Click your photo to upload a custom one."}
          </p>
          {profile?.has_profile_image && !photoBusy && (
            <button
              type="button"
              onClick={removePhoto}
              className="mt-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Remove custom photo
            </button>
          )}
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          About
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
              placeholder="Your name"
              className={inputCls}
            />
          </Field>
          <Field label="Nickname">
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => update("nickname", e.target.value)}
              placeholder="What people call you"
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                placeholder="A short bio — what kind of footage do you fly?"
                className={inputCls + " resize-y"}
              />
            </Field>
          </div>
          <Field label="Country">
            <input
              type="text"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              placeholder="Switzerland"
              className={inputCls}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Zurich"
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Social links
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Leave any blank that don't apply.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => {
            // Website is the catch-all for personal sites — give it the
            // full width so users can paste long URLs comfortably.
            const fullWidth = p.key === "website";
            return (
              <div key={p.key} className={fullWidth ? "sm:col-span-2" : ""}>
                <Field label={p.label}>
                  <input
                    type="url"
                    value={form.social[p.key] ?? ""}
                    onChange={(e) => setSocial(p.key, e.target.value)}
                    placeholder={p.placeholder}
                    className={inputCls}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </section>

      {(error || localError) && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error || localError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Saved.
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function UserIdChip({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on insecure contexts; fall back to no-op —
      // the user can still triple-click to select the chip's text.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy user ID"
      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
    >
      <span className="truncate">{userId}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
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

// ---------------------------------------------------------------------------
// Public view (someone else's profile)
// ---------------------------------------------------------------------------

function PublicProfile({
  currentUserId,
  targetUserId,
  clerkUser,
  profile,
  error,
}: {
  currentUserId: string;
  targetUserId: string;
  clerkUser: ShareableUser | null;
  profile: Profile | null;
  error: string | null;
}) {
  const [composeOpen, setComposeOpen] = useState(false);

  const customAvatarUrl =
    profile?.has_profile_image && profile?.updated_at
      ? profilePhotoUrl(targetUserId, currentUserId, profile.updated_at)
      : null;
  const name = effectiveName(profile, clerkUser);
  const place = useMemo(() => {
    const parts = [profile?.city, profile?.country].filter(Boolean) as string[];
    if (parts.length > 0) return parts.join(", ");
    return profile?.location_label ?? null;
  }, [profile]);

  const links = useMemo(() => {
    const out: { meta: SocialMeta; url: string }[] = [];
    if (!profile?.social_links) return out;
    for (const p of SOCIAL_PLATFORMS) {
      const url = profile.social_links[p.key];
      if (url) out.push({ meta: p, url });
    }
    return out;
  }, [profile]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar src={customAvatarUrl} user={clerkUser} fallback={name} />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {name}
            </h1>
            {profile?.nickname && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                "{profile.nickname}"
              </p>
            )}
            {clerkUser?.email && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {clerkUser.email}
              </p>
            )}
            {place && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 text-brand-600 dark:text-orange-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 22s7-7.58 7-13a7 7 0 10-14 0c0 5.42 7 13 7 13z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                {place}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-orange-500 dark:hover:bg-orange-600"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Send message
          </button>
        </div>

        {profile?.description && (
          <p className="mt-5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {profile.description}
          </p>
        )}
      </section>

      {links.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Links
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {links.map(({ meta, url }) => (
              <li key={meta.key}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-orange-400/40 dark:hover:bg-orange-500/10 dark:hover:text-orange-400"
                >
                  <PlatformIcon platform={meta.key} />
                  <span className="font-medium">{meta.label}</span>
                  <span className="ml-auto truncate text-xs text-slate-500 dark:text-slate-400">
                    {url.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <NewMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        userId={currentUserId}
        initialRecipientId={targetUserId}
        onSent={() => setComposeOpen(false)}
      />
    </div>
  );
}
