"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Check, Save, Upload, X, AlertTriangle, Download, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "firebase/auth";
import AvatarCropModal from "@/components/AvatarCropModal";
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";

const GENRES = [
  { key: "genreAction", label: "Action / Adventure" },
  { key: "genreHorror", label: "Horror" },
  { key: "genreDrama", label: "Drama" },
  { key: "genreScifi", label: "Sci-Fi" },
  { key: "genreThriller", label: "Thriller" },
  { key: "genreComedy", label: "Comedy" },
  { key: "genreFantasy", label: "Fantasy" },
  { key: "genreRomance", label: "Romance" },
  { key: "genreDocumentary", label: "Documentary" },
  { key: "genreFamily", label: "Family" },
  { key: "genreHistorical", label: "Historical" },
  { key: "genreMusical", label: "Musical" },
  { key: "genreBiopic", label: "Biopic" },
  { key: "genreCrime", label: "Crime" },
  { key: "genreFilmNoir", label: "Film-Noir" },
  { key: "genreBookAdapt", label: "Book Adaptation" },
  { key: "genreWestern", label: "Western" },
  { key: "genreMystery", label: "Mystery" },
];

const COMPONENTS = [
  { key: "narrativeFocused", label: "Narrative", desc: "Story, pacing, originality" },
  { key: "characterFocused", label: "Characters", desc: "Development, relatability" },
  { key: "messageFocused", label: "Message & Meaning", desc: "Themes, depth, emotional impact" },
  { key: "cinematicFocused", label: "Cinematic", desc: "Cinematography, visuals, music" },
  { key: "performanceFocused", label: "Performance", desc: "Acting, casting, choreography" },
  { key: "entertainmentFocused", label: "Entertainment", desc: "Appeal, pacing, engagement" },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showSuccess(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
  function showError(msg: string) { setError(msg); setTimeout(() => setError(null), 5000); }

  // Snapshot of fields as last loaded/saved. Used to detect unsaved
  // changes for the leave-page warning. JSON-serializable subset is
  // simpler than per-field equality checks. Stored in a ref so a
  // save-handler that updates it doesn't trigger a re-render.
  const initialSnapshot = useRef<string>("");

  // Account state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  // pendingPreview is briefly set during the in-flight upload to
  // give the user immediate visual feedback before the real
  // avatarUrl comes back from the server.
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  // Source URL passed to the crop modal — separate from preview
  // because preview is the *cropped* result, while this is the
  // original file's object URL used while cropping.
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoDateOnSeen, setAutoDateOnSeen] = useState(false);
  const [autoSeenOnWatchlistCheck, setAutoSeenOnWatchlistCheck] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    commentOnContent: true, likeOnContent: true, commentReplies: true,
    commentLikes: true, milestones: true, watchlistInvites: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [savedNotif, setSavedNotif] = useState(false);
  const [publicTabs, setPublicTabs] = useState<Record<string, boolean>>({
    overview: true, ratings: true, diary: true, watchlist: true, stats: true, rankings: true,
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savedAccount, setSavedAccount] = useState(false);
  const [accountError, setAccountError] = useState("");

  // Preference state
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [componentScores, setComponentScores] = useState<Record<string, number>>(
    Object.fromEntries(COMPONENTS.map((c) => [c.key, 5]))
  );
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [ratistReviewCount, setRatistReviewCount] = useState(0);
  const [emailPrefs, setEmailPrefs] = useState({ promotional: true, subscription: true, activity: true });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await signOut();
      } else {
        showError("Failed to delete account. Please try again.");
      }
    } catch {
      showError("Failed to delete account. Please try again.");
    }
    setDeleting(false);
  }

  useEffect(() => {
    if (!user) return;
    Promise.all([
      user.getIdToken().then((token) =>
        fetch("/api/profile/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
          if (!r.ok) throw new Error("Failed to load profile");
          return r.json();
        })
      ),
      user.getIdToken().then((token) =>
        fetch("/api/profile/preferences", { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
          if (!r.ok) throw new Error("Failed to load preferences");
          return r.json();
        })
      ),
      user.getIdToken().then((token) =>
        fetch("/api/subscription/status", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({}))
      ),
    ]).then(([meData, prefData, subData]) => {
      setRatistReviewCount(subData.standardReviewCount ?? 0);
      if (meData.user) {
        setDisplayName(meData.user.name ?? "");
        setAvatarUrl(meData.user.avatarUrl ?? "");
        setBio(meData.user.bio ?? "");
        setIsPrivate(meData.user.isPrivate ?? false);
        setAutoDateOnSeen(meData.user.autoDateOnSeen ?? false);
        setAutoSeenOnWatchlistCheck(meData.user.autoSeenOnWatchlistCheck ?? false);
        if (meData.user.publicTabs) {
          setPublicTabs((prev) => ({ ...prev, ...meData.user.publicTabs }));
        }
        if (meData.user.notificationPrefs) {
          setNotifPrefs((prev) => ({ ...prev, ...meData.user.notificationPrefs }));
        }
        if (meData.user.emailPrefs) {
          setEmailPrefs((prev) => ({ ...prev, ...meData.user.emailPrefs }));
        }
      }
      const p = prefData.profile;
      if (p) {
        const loved = new Set<string>(
          GENRES.filter((g) => (p[g.key] ?? 0) >= 5).map((g) => g.key)
        );
        setSelectedGenres(loved);
        const scores: Record<string, number> = {};
        for (const c of COMPONENTS) {
          scores[c.key] = p[c.key] != null ? Math.max(1, Math.round(p[c.key])) : 5;
        }
        setComponentScores(scores);
      }
      setLoading(false);
    }).catch(() => { showError("Failed to load settings"); setLoading(false); });
  }, [user]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({
      displayName, bio, isPrivate, autoDateOnSeen, autoSeenOnWatchlistCheck,
      publicTabs, notifPrefs, emailPrefs,
      selectedGenres: Array.from(selectedGenres).sort(),
      componentScores,
    }),
    [displayName, bio, isPrivate, autoDateOnSeen, autoSeenOnWatchlistCheck, publicTabs, notifPrefs, emailPrefs, selectedGenres, componentScores]
  );

  // Snapshot the loaded values once loading flips false. Done in an
  // effect (not via rAF inside the load handler) so the closure
  // captures the post-update render's values rather than the
  // pre-update mount-render's. Save handlers also reassign this ref
  // directly to extend "saved == loaded" forward in time.
  useEffect(() => {
    if (loading) return;
    if (initialSnapshot.current !== "") return;
    initialSnapshot.current = currentSnapshot;
  }, [loading, currentSnapshot]);

  const isDirty = !loading
    && initialSnapshot.current !== ""
    && currentSnapshot !== initialSnapshot.current;
  useUnsavedWarning(isDirty);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Local validation before upload
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setAccountError("Unsupported file type. Use JPEG, PNG, WebP, or GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAccountError("File too large. Maximum size is 5 MB.");
      return;
    }
    setAccountError("");
    // Open the crop modal first — pendingFile is set only after
    // the user confirms a crop. Keeps the flow: pick → crop → save.
    setCropSource(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob, previewUrl: string) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
    // Show the cropped result optimistically while we upload.
    setPendingPreview(previewUrl);

    if (!user) return;
    try {
      const token = await user.getIdToken();
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok) {
        // Roll back the optimistic preview on failure so the user
        // doesn't see a "saved" state for a photo that didn't upload.
        setPendingPreview(null);
        URL.revokeObjectURL(previewUrl);
        setAccountError(data.error ?? "Image upload failed.");
        return;
      }
      setAvatarUrl(data.avatarUrl);
      // Sync to Firebase Auth so the new photo persists across
      // tabs/refresh without waiting for a separate Save Account.
      await updateProfile(user, { photoURL: data.avatarUrl }).catch(() => null);
      // Clear the local preview now that the real URL is live.
      URL.revokeObjectURL(previewUrl);
      setPendingPreview(null);
      showSuccess("Profile picture updated");
    } catch {
      setPendingPreview(null);
      URL.revokeObjectURL(previewUrl);
      setAccountError("An unexpected error occurred uploading your photo.");
    }
  }

  function handleCropCancel() {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
  }

  function toggleGenre(key: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSaveAccount() {
    if (!user || savingAccount) return;
    if (!displayName.trim()) { setAccountError("Display name cannot be empty."); return; }
    setSavingAccount(true);
    setSavedAccount(false);
    setAccountError("");
    // Capture the snapshot at click time. If the user makes more
    // changes while the save is in flight, those should still be
    // detected as unsaved on success.
    const snapshotBeingSaved = currentSnapshot;

    try {
      const token = await user.getIdToken();

      // Avatar uploads happen at crop-confirm time now (autosave),
      // so this handler only persists name / bio / preferences.
      const finalAvatarUrl = avatarUrl;

      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName, bio, isPrivate, autoDateOnSeen, autoSeenOnWatchlistCheck, publicTabs }),
      });

      if (res.ok) {
        // Sync display name and avatar to Firebase Auth so it persists on refresh
        await updateProfile(user, {
          displayName: displayName.trim(),
          ...(finalAvatarUrl ? { photoURL: finalAvatarUrl } : {}),
        });
        setSavedAccount(true);
        setTimeout(() => setSavedAccount(false), 2500);
        initialSnapshot.current = snapshotBeingSaved;
      } else {
        setAccountError("Failed to save. Please try again.");
      }
    } catch {
      setAccountError("An unexpected error occurred.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSavePrefs() {
    if (!user || savingPrefs) return;
    setSavingPrefs(true);
    setSavedPrefs(false);
    const prefs: Record<string, number> = {};
    for (const g of GENRES) prefs[g.key] = selectedGenres.has(g.key) ? 8 : 2;
    for (const c of COMPONENTS) prefs[c.key] = componentScores[c.key];
    const token = await user.getIdToken();
    const res = await fetch("/api/profile/preferences", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSavingPrefs(false);
    if (!res.ok) {
      showError("Failed to save preferences");
      return;
    }
    setSavedPrefs(true);
    showSuccess("Preferences saved");
    setTimeout(() => setSavedPrefs(false), 2500);
    initialSnapshot.current = currentSnapshot;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">
        Sign in to manage your settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">
        Loading…
      </div>
    );
  }

  const previewSrc = pendingPreview ?? avatarUrl ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {cropSource && (
        <AvatarCropModal
          src={cropSource}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-3"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-300 ml-3"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── ACCOUNT ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-1">Account</h2>
        <p className="text-xs text-[var(--foreground-muted)] mb-5">Update your public profile.</p>

        <div className="space-y-5">
          {/* Avatar upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Profile Picture</label>
            <div className="flex items-center gap-4">
              {/* Preview */}
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)] shrink-0">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-[var(--ratist-red)]">
                    {displayName[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {avatarUrl ? "Change photo" : "Upload photo"}
                </button>
                <p className="text-xs text-[var(--foreground-muted)]">
                  JPEG, PNG, WebP or GIF · max 5 MB · saved automatically
                </p>
              </div>
            </div>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Tell others a bit about your movie taste…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
            />
            <p className="text-xs text-[var(--foreground-muted)] mt-1">{bio.length}/200</p>
          </div>

          {/* Private profile toggle */}
          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm font-medium text-white">Private profile</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                When on, only you can see your profile. Shared links (Year in Review, rating cards, taste comparisons) still work.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate((v) => !v)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${isPrivate ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Per-tab visibility — shown regardless of profile
              privacy, since private accounts can still gate which
              tabs their accepted followers see. */}
          <div className="pt-2">
              <p className="text-sm font-medium text-white mb-1">
                {isPrivate ? "Visible to followers" : "Visible to others"}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mb-3">
                {isPrivate
                  ? "Even with a private profile, you can hide individual tabs from your approved followers."
                  : "Choose which tabs visitors can see on your profile."}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "ratings", label: "Ratings" },
                  { key: "diary", label: "Diary" },
                  { key: "watchlist", label: "Watchlist" },
                  { key: "stats", label: "Stats" },
                  { key: "rankings", label: "Rankings" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      publicTabs[key]
                        ? "border-[var(--ratist-red)]/50 bg-[var(--ratist-red)]/10 text-white"
                        : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={publicTabs[key] ?? true}
                      onChange={(e) => setPublicTabs((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      publicTabs[key] ? "bg-[var(--ratist-red)] border-[var(--ratist-red)]" : "border-[var(--border)]"
                    }`}>
                      {publicTabs[key] && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
        </div>

          {/* Auto-date on seen */}
          <div className="flex items-start justify-between gap-4 pt-2">
            <div>
              <p className="text-sm font-medium text-white">Auto-log date when marking seen</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                When on, marking a movie as seen automatically logs today&apos;s date in your diary. Turn off if you prefer to add dates manually.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoDateOnSeen((v) => !v)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${autoDateOnSeen ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoDateOnSeen ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>


        {accountError && <p className="text-sm text-red-400 mt-3">{accountError}</p>}

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSaveAccount}
            disabled={savingAccount}
            className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {savingAccount ? "Saving…" : "Save Account"}
          </button>
          {savedAccount && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </section>

      {ratistReviewCount < 10 && (<>
      <div className="border-t border-[var(--border)]" />

      {/* ── GENRE PREFERENCES ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-1">Favorite Genres</h2>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          Select the genres you love — they carry extra weight in your recommendations.
        </p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => {
            const selected = selectedGenres.has(g.key);
            return (
              <button
                key={g.key}
                onClick={() => toggleGenre(g.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selected
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
                }`}
              >
                {selected && <Check className="w-3 h-3" />}
                {g.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── COMPONENT WEIGHTS ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-1">What Matters to You</h2>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          Adjust how much each pillar influences your personal score.
        </p>
        <div className="space-y-5">
          {COMPONENTS.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div>
                  <span className="text-sm font-medium text-white">{c.label}</span>
                  <span className="text-xs text-[var(--foreground-muted)] ml-2">{c.desc}</span>
                </div>
                <span className="text-sm font-bold text-[var(--ratist-red)] w-6 text-right">
                  {componentScores[c.key]}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={componentScores[c.key]}
                onChange={(e) =>
                  setComponentScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))
                }
                className="w-full accent-[var(--ratist-red)] h-1.5"
              />
              <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-0.5">
                <span>Not important</span>
                <span>Very important</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 pb-10">
        <button
          onClick={handleSavePrefs}
          disabled={savingPrefs}
          className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {savingPrefs ? "Saving…" : "Save Preferences"}
        </button>
        {savedPrefs && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
      </>)}

      {/* ── Subscription ── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-1">Subscription</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">Manage your Backstage Pass membership.</p>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <Link href="/backstage-pass" className="flex items-center justify-between group">
            <div>
              <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors">Backstage Pass</p>
              <p className="text-xs text-[var(--foreground-muted)]">Premium features, ad-free, custom themes, and more</p>
            </div>
            <span className="text-sm text-[var(--ratist-red)] font-semibold">View Plans →</span>
          </Link>
        </div>
      </section>

      {/* ── Notification Preferences ── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-1">Notification Preferences</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">Choose which notifications you want to receive.</p>
        <div className="space-y-3">
          {[
            { key: "commentOnContent" as const, label: "Comments on your content", desc: "When someone comments on your reviews, posts, or community submissions" },
            { key: "likeOnContent" as const, label: "Likes on your content", desc: "When someone likes your reviews or posts" },
            { key: "commentReplies" as const, label: "Replies to your comments", desc: "When someone replies to a comment you made" },
            { key: "commentLikes" as const, label: "Likes on your comments", desc: "When someone likes a comment you made" },
            { key: "milestones" as const, label: "Milestone alerts", desc: "When your content reaches like/comment milestones (50, 100, 500, etc.)" },
            { key: "watchlistInvites" as const, label: "Watchlist invites", desc: "When someone invites you to collaborate on a watchlist" },
          ].map((pref) => (
            <label key={pref.key} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={notifPrefs[pref.key]}
                onChange={(e) => setNotifPrefs((prev) => ({ ...prev, [pref.key]: e.target.checked }))}
                className="mt-1 accent-[var(--ratist-red)]"
              />
              <div>
                <p className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors">{pref.label}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{pref.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={async () => {
              if (!user) return;
              setSavingNotif(true);
              setSavedNotif(false);
              const token = await user.getIdToken();
              const res = await fetch("/api/profile/me", {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ notificationPrefs: notifPrefs }),
              });
              setSavingNotif(false);
              if (!res.ok) {
                showError("Failed to save notification preferences");
                return;
              }
              setSavedNotif(true);
              showSuccess("Notification preferences saved");
              setTimeout(() => setSavedNotif(false), 3000);
              initialSnapshot.current = currentSnapshot;
            }}
            disabled={savingNotif}
            className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {savingNotif ? "Saving…" : "Save Notifications"}
          </button>
          {savedNotif && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </section>

      {/* ── Privacy & Data ── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-white mb-1">Privacy & Data</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">Manage your email preferences and personal data.</p>

        {/* Email preferences */}
        <div className="mb-6">
          <p className="text-sm font-medium text-white flex items-center gap-1.5 mb-1"><Mail className="w-4 h-4" /> Email preferences</p>
          <p className="text-xs text-[var(--foreground-muted)] mb-4">
            Choose which types of emails you&apos;d like to receive. Essential emails (password resets, security alerts, policy updates) are always sent.
          </p>
          <div className="space-y-3">
            {([
              { key: "promotional" as const, label: "Promotional", desc: "New features, special offers, and announcements" },
              { key: "subscription" as const, label: "Subscription & billing", desc: "Subscription expiry reminders, payment issues, promo rewards" },
              { key: "activity" as const, label: "Account activity", desc: "Messages from the Ratist team about your account" },
            ]).map((pref) => (
              <label key={pref.key} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={emailPrefs[pref.key]}
                  onChange={async (e) => {
                    if (!user) return;
                    const updated = { ...emailPrefs, [pref.key]: e.target.checked };
                    setEmailPrefs(updated);
                    const token = await user.getIdToken();
                    await fetch("/api/profile/me", {
                      method: "PATCH",
                      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ emailPrefs: updated }),
                    });
                  }}
                  className="mt-1 accent-[var(--ratist-red)]"
                />
                <div>
                  <p className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors">{pref.label}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{pref.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {emailPrefs.promotional && emailPrefs.subscription && emailPrefs.activity ? null : (
            <button
              onClick={async () => {
                if (!user) return;
                const all = { promotional: true, subscription: true, activity: true };
                setEmailPrefs(all);
                const token = await user.getIdToken();
                await fetch("/api/profile/me", {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ emailPrefs: all }),
                });
              }}
              className="mt-3 text-xs text-[var(--ratist-red)] hover:underline"
            >
              Re-enable all emails
            </button>
          )}
        </div>

        {/* Data export */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-1.5"><Download className="w-4 h-4" /> Export your data</p>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              Download a zip of CSV files with all your personal data — ratings, reviews, watchlists, diary, comments, and badges. Available once per day.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!user || exporting) return;
              setExporting(true);
              setExportError(null);
              try {
                const token = await user.getIdToken();
                const res = await fetch("/api/profile/export", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `ratist-export-${new Date().toISOString().slice(0, 10)}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  const data = await res.json().catch(() => ({}));
                  setExportError(data.error ?? "Failed to export data. Please try again.");
                }
              } catch {
                setExportError("Failed to export data. Please try again.");
              }
              setExporting(false);
            }}
            disabled={exporting}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-lg hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Exporting..." : "Download"}
          </button>
        </div>
        {exportError && (
          <p className="text-sm text-red-400 mb-4">{exportError}</p>
        )}

        <p className="text-xs text-[var(--foreground-muted)]">
          For more details, see our <Link href="/privacy" className="text-[var(--ratist-red)] hover:underline">Privacy Policy</Link>.
        </p>
      </section>

      {/* ── Danger Zone ── */}
      <section className="border border-red-500/30 rounded-2xl p-6 bg-red-500/5">
        <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger Zone
        </h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Deleting your account will immediately hide your profile and data from the site. Your account and all associated data (ratings, watchlists, seen movies, reviews, etc.) will be <strong className="text-white">permanently deleted after 30 days</strong>. If you log back in within 30 days, you&apos;ll have the option to restore your account with all data intact, or start fresh.
        </p>
        {deleteConfirm ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, Delete My Account"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="px-5 py-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-semibold rounded-lg transition-colors"
          >
            Delete My Account
          </button>
        )}
      </section>
    </div>
  );
}
