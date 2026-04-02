"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Save, Upload, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoDateOnSeen, setAutoDateOnSeen] = useState(false);
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

  useEffect(() => {
    if (!user) return;
    Promise.all([
      user.getIdToken().then((token) =>
        fetch("/api/profile/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      ),
      user.getIdToken().then((token) =>
        fetch("/api/profile/preferences", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      ),
    ]).then(([meData, prefData]) => {
      if (meData.user) {
        setDisplayName(meData.user.name ?? "");
        setAvatarUrl(meData.user.avatarUrl ?? "");
        setBio(meData.user.bio ?? "");
        setIsPrivate(meData.user.isPrivate ?? false);
        setAutoDateOnSeen(meData.user.autoDateOnSeen ?? false);
        if (meData.user.publicTabs) {
          setPublicTabs((prev) => ({ ...prev, ...meData.user.publicTabs }));
        }
        if (meData.user.notificationPrefs) {
          setNotifPrefs((prev) => ({ ...prev, ...meData.user.notificationPrefs }));
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
    }).catch(() => setLoading(false));
  }, [user]);

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
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  function cancelPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    try {
      const token = await user.getIdToken();

      // If there's a pending file, upload it first
      let finalAvatarUrl = avatarUrl;
      if (pendingFile) {
        const formData = new FormData();
        formData.append("file", pendingFile);
        const uploadRes = await fetch("/api/profile/avatar", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setAccountError(uploadData.error ?? "Image upload failed.");
          setSavingAccount(false);
          return;
        }
        finalAvatarUrl = uploadData.avatarUrl;
        setAvatarUrl(finalAvatarUrl);
        cancelPendingFile();
      }

      // Save name, bio (avatar already saved by upload endpoint)
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName, bio, isPrivate, autoDateOnSeen, publicTabs }),
      });

      if (res.ok) {
        setSavedAccount(true);
        setTimeout(() => setSavedAccount(false), 2500);
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
    await fetch("/api/profile/preferences", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSavingPrefs(false);
    setSavedPrefs(true);
    setTimeout(() => setSavedPrefs(false), 2500);
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
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

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
                  {pendingFile ? "Change photo" : "Upload photo"}
                </button>
                {pendingFile && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--foreground-muted)] truncate max-w-[180px]">
                      {pendingFile.name}
                    </span>
                    <button type="button" onClick={cancelPendingFile} className="text-[var(--foreground-muted)] hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-[var(--foreground-muted)]">
                  JPEG, PNG, WebP or GIF · max 5 MB
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

          {/* Per-tab visibility (only shown when profile is NOT fully private) */}
          {!isPrivate && (
            <div className="pt-2">
              <p className="text-sm font-medium text-white mb-1">Visible to others</p>
              <p className="text-xs text-[var(--foreground-muted)] mb-3">
                Choose which tabs visitors can see on your profile.
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
          )}
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
            {savingAccount ? (pendingFile ? "Uploading…" : "Saving…") : "Save Account"}
          </button>
          {savedAccount && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </section>

      <div className="border-t border-[var(--border)]" />

      {/* ── GENRE PREFERENCES ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-1">Favourite Genres</h2>
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
              await fetch("/api/profile/me", {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ notificationPrefs: notifPrefs }),
              });
              setSavingNotif(false);
              setSavedNotif(true);
              setTimeout(() => setSavedNotif(false), 3000);
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
    </div>
  );
}
