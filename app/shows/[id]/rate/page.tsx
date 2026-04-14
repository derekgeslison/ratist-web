"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

type ReviewMode = "basic" | "standard" | "critic";

const CRITERIA = {
  "Story": {
    key: "story",
    weight: 5,
    fields: [
      { key: "plot", label: "Plot", required: true, desc: "Was the show coherent? Were complexities executed well across episodes?" },
      { key: "premiseOriginality", label: "Premise / Originality", required: false, desc: "Was the premise compelling? Did the show stand out from others?" },
      { key: "storytelling", label: "Story-telling", required: true, desc: "Did the show flow well? Were storylines interesting and well-developed?" },
      { key: "characterDev", label: "Character Development", required: false, desc: "Are the main characters explored well? Do they grow throughout the show?" },
      { key: "pacingClimax", label: "Pacing / Climax", required: true, desc: "Was there a continuous rise in excitement? Was the show well paced across episodes?" },
    ],
  },
  "Production & Style": {
    key: "style",
    weight: 3,
    fields: [
      { key: "cinematography", label: "Cinematography", required: true, desc: "Was the show visually pleasing? Were there creative or beautiful shots?" },
      { key: "locationCost", label: "Location & Costuming", required: false, desc: "Did the locations and costumes match the content and characters?" },
      { key: "realism", label: "Realism / Believability", required: false, desc: "Did everything feel believable within the show's world?" },
      { key: "artisticEffect", label: "Artistic Effect", required: true, desc: "How artistic was the show? Did it force you to think and interpret?" },
      { key: "visualEffects", label: "Visual Effects", required: false, desc: "(If applicable) Were the VFX high quality? Did they add or detract?" },
      { key: "musicSound", label: "Music & Sound Effects", required: false, desc: "Did the music add to the experience? Were sound effects accurate and good quality?" },
    ],
  },
  "Emotive Effect": {
    key: "emotive",
    weight: 3,
    fields: [
      { key: "overallEmotion", label: "Overall Emotion", required: true, desc: "Did the show create excitement, intrigue, or any strong emotion? How intense?" },
      { key: "relatability", label: "Relatability", required: true, desc: "Were you able to relate to characters or plot points?" },
      { key: "meaning", label: "Meaning / Message", required: true, desc: "Did the plot have a reason behind it? Was there a moral to the story?" },
      { key: "movingness", label: "Movingness", required: false, desc: "Were you moved by the story? Did it generate new thoughts or perspectives?" },
    ],
  },
  "Acting & Casting": {
    key: "acting",
    weight: 3,
    fields: [
      { key: "casting", label: "Casting & Subjects", required: true, desc: "Were the right people chosen for this show? Consider actors, voice talent, or documentary subjects." },
      { key: "actingQuality", label: "Performance Quality", required: true, desc: "How compelling were the performances? Consider acting, voice work, or on-screen presence." },
      { key: "dialogueScripting", label: "Dialogue & Writing", required: false, desc: "Was the writing effective? Consider dialogue, narration, or commentary." },
    ],
  },
  "Pure Entertainment": {
    key: "entertainment",
    weight: 2,
    fields: [
      { key: "appeal", label: "Appeal", required: true, desc: "Was the show overall appealing? Is it worth watching more than once?" },
      { key: "superficialAllure", label: "Superficial Allure", required: false, desc: "Is the appeal based heavily in sex appeal, action, or 'wow factor'? (Not included in score)" },
      { key: "choreography", label: "Choreography", required: false, desc: "Were physical actions of characters and objects good and natural?" },
    ],
  },
};

interface ShowInfo { name: string; poster_path: string | null; first_air_date: string; number_of_seasons?: number }

export default function RateShowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [show, setShow] = useState<ShowInfo | null>(null);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [reviewText, setReviewText] = useState("");
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ReviewMode>("standard");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(CRITERIA).map((k) => [k, true]))
  );
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [fieldComments, setFieldComments] = useState<Record<string, string>>({});
  const [categoryComments, setCategoryComments] = useState<Record<string, string>>({});
  const [hasExisting, setHasExisting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [allSeasonRatings, setAllSeasonRatings] = useState<{ seasonNumber: number; ratistRating: number | null; overallRating: number | null }[]>([]);
  const [seriesRatingScore, setSeriesRatingScore] = useState<number | null>(null);
  const [loadingScope, setLoadingScope] = useState(false);

  // Scope: series or season
  const [ratingScope, setRatingScope] = useState<"series" | "season">(
    (searchParams.get("scope") as "series" | "season") ?? "series"
  );
  const [seasonNumber, setSeasonNumber] = useState<number>(
    Number(searchParams.get("season") ?? 1)
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push(`/auth/signin?redirect=${encodeURIComponent(pathname)}`); return; }

    // Reset form state when scope changes
    setValues({});
    setOverallRating(null);
    setReviewText("");
    setMode("standard");
    setHasSpoilers(false);
    setCommentsDisabled(false);
    setFieldComments({});
    setCategoryComments({});
    setHasExisting(false);
    setDraftLoaded(false);
    setLoadingScope(true);

    user.getIdToken().then((token) => {
      const scopeParam = ratingScope === "season" ? `?scope=season&season=${seasonNumber}` : "";
      fetch(`/api/shows/${id}/rate${scopeParam}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(({ rating, seasonRatings }) => {
          // Track all season/series ratings for status display
          if (seasonRatings) setAllSeasonRatings(seasonRatings);
          if (rating?.ratingScope === "series" || ratingScope === "series") {
            setSeriesRatingScore(rating?.ratistRating ?? rating?.overallRating ?? null);
          }

          if (rating) {
            const loaded: Record<string, number | null> = {};
            for (const cat of Object.values(CRITERIA)) {
              for (const field of cat.fields) {
                loaded[field.key] = rating[field.key] ?? null;
              }
            }
            setValues(loaded);
            setOverallRating(rating.overallRating ?? null);
            setReviewText(rating.reviewText ?? "");
            if (rating.reviewType) setMode(rating.reviewType);
            if (rating.hasSpoilers) setHasSpoilers(rating.hasSpoilers);
            if (rating.commentsDisabled) setCommentsDisabled(rating.commentsDisabled);
            if (rating.fieldComments) setFieldComments(rating.fieldComments);
            if (rating.categoryComments) setCategoryComments(rating.categoryComments);
            setHasExisting(true);
          } else {
            // No server rating — try localStorage draft
            try {
              const raw = localStorage.getItem(`ratist-draft-show-${id}-${ratingScope}-${ratingScope === "season" ? seasonNumber : 0}`);
              if (raw) {
                const draft = JSON.parse(raw);
                if (draft.values) setValues(draft.values);
                if (draft.overallRating != null) setOverallRating(draft.overallRating);
                if (draft.reviewText) setReviewText(draft.reviewText);
                if (draft.mode) setMode(draft.mode);
                if (draft.hasSpoilers) setHasSpoilers(draft.hasSpoilers);
                if (draft.commentsDisabled) setCommentsDisabled(draft.commentsDisabled);
                if (draft.fieldComments) setFieldComments(draft.fieldComments);
                if (draft.categoryComments) setCategoryComments(draft.categoryComments);
              }
            } catch { /* ignore */ }
          }
          setDraftLoaded(true);
          setLoadingScope(false);
        });
    });
  }, [authLoading, user, id, router, ratingScope, seasonNumber]);

  useEffect(() => {
    fetch(`/api/tmdb/tv/${id}`)
      .then(r => r.json()).then(setShow).catch(() => null);
  }, [id]);

  // Auto-save draft to localStorage
  const draftKey = `ratist-draft-show-${id}-${ratingScope}-${ratingScope === "season" ? seasonNumber : 0}`;
  useEffect(() => {
    if (!draftLoaded) return;
    const hasAnyValue = overallRating != null || reviewText.trim() || Object.values(values).some((v) => v != null);
    if (!hasAnyValue) return;
    const draft = { values, overallRating, reviewText, mode, hasSpoilers, commentsDisabled, fieldComments, categoryComments, savedAt: Date.now() };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }, [values, overallRating, reviewText, mode, hasSpoilers, commentsDisabled, fieldComments, categoryComments, draftKey, draftLoaded]);

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setValues({});
    setOverallRating(null);
    setReviewText("");
    setMode("standard");
    setHasSpoilers(false);
    setCommentsDisabled(false);
    setFieldComments({});
    setCategoryComments({});
    setDraftLoaded(true);
  }

  function setValue(key: string, val: number) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function allRequiredFilled() {
    if (overallRating == null) return false;
    if (mode === "basic") return true;
    for (const cat of Object.values(CRITERIA)) {
      for (const field of cat.fields) {
        if (field.required && !values[field.key]) return false;
      }
    }
    return true;
  }

  async function submitRating(isDraft: boolean) {
    if (!user) return;
    if (!isDraft && !allRequiredFilled()) {
      setError(mode === "basic"
        ? "Please set your overall rating."
        : "Please fill in all required fields, or save as a draft to come back later.");
      return;
    }
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();

    const payload: Record<string, unknown> = {
      overallRating,
      reviewText,
      reviewType: mode,
      hasSpoilers,
      commentsDisabled,
      showName: show?.name,
      firstAirDate: show?.first_air_date ?? null,
      ratingScope,
      ...(ratingScope === "season" ? { seasonNumber } : {}),
    };

    if (mode !== "basic") {
      Object.assign(payload, values);
    }

    if (mode === "critic") {
      const fc = Object.fromEntries(Object.entries(fieldComments).filter(([, v]) => v.trim()));
      const cc = Object.fromEntries(Object.entries(categoryComments).filter(([, v]) => v.trim()));
      if (Object.keys(fc).length > 0) payload.fieldComments = fc;
      if (Object.keys(cc).length > 0) payload.categoryComments = cc;
    }

    const res = await fetch(`/api/shows/${id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      localStorage.removeItem(draftKey);
      router.push(isDraft ? `/shows/${id}` : `/shows/${id}?rated=1`);
    } else {
      setError("Failed to save. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitRating(false);
  }

  async function deleteRating() {
    if (!user) return;
    setDeleting(true);
    const token = await user.getIdToken();
    const scopeParam = ratingScope === "season" ? `?scope=season&season=${seasonNumber}` : "";
    const res = await fetch(`/api/shows/${id}/rate${scopeParam}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      localStorage.removeItem(`ratist-draft-show-${id}-${ratingScope}-${ratingScope === "season" ? seasonNumber : 0}`);
      router.push(`/shows/${id}`);
    } else {
      setError("Failed to delete rating.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (authLoading) return null;

  const totalSeasons = show?.number_of_seasons ?? 1;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Show header */}
      <div className="flex items-center gap-4 mb-6">
        {show?.poster_path && (
          <Image src={posterUrl(show.poster_path, "w92")} alt="" width={56} height={84} className="rounded-lg w-14 h-auto" />
        )}
        <div>
          <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Rating</p>
          <h1 className="text-xl font-bold text-white">{show?.name ?? "Loading..."}</h1>
          <p className="text-sm text-[var(--foreground-muted)]">{show?.first_air_date?.slice(0, 4)}</p>
        </div>
      </div>

      {/* Scope selector: Series vs Season */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-3">What are you rating?</p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setRatingScope("series")}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
              ratingScope === "series"
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Entire Series
            {seriesRatingScore != null && ratingScope !== "series" && (
              <span className="ml-1.5 text-xs opacity-70">({seriesRatingScore.toFixed(1)})</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setRatingScope("season")}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
              ratingScope === "season"
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Specific Season
          </button>
        </div>
        {ratingScope === "season" && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--foreground-muted)]">Season:</label>
            <select
              value={seasonNumber}
              onChange={(e) => setSeasonNumber(Number(e.target.value))}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            >
              {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((n) => {
                const existing = allSeasonRatings.find((r) => r.seasonNumber === n);
                const score = existing?.ratistRating ?? existing?.overallRating;
                return <option key={n} value={n}>Season {n}{score != null ? ` (rated ${score.toFixed(1)})` : ""}</option>;
              })}
            </select>
          </div>
        )}

        {/* Status indicator */}
        {loadingScope ? (
          <p className="text-xs text-[var(--foreground-muted)] mt-3">Loading...</p>
        ) : hasExisting ? (
          <p className="text-xs text-emerald-400 mt-3">
            You&apos;ve already rated {ratingScope === "series" ? "this series" : `Season ${seasonNumber}`}. Your saved rating is loaded below — edit and save to update.
          </p>
        ) : (
          <p className="text-xs text-[var(--foreground-muted)] mt-3">
            {ratingScope === "series" ? "No series rating yet" : `No rating for Season ${seasonNumber} yet`} — fill out the form below to submit.
          </p>
        )}
      </div>

      {/* Review mode toggle */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-3">Review Type</p>
        <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
          {([
            { key: "basic" as ReviewMode, label: "Quick", desc: "Overall score only" },
            { key: "standard" as ReviewMode, label: "Ratist", desc: "Full breakdown" },
            { key: "critic" as ReviewMode, label: "Critic", desc: "With commentary" },
          ]).map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 py-3 px-2 text-center transition-colors ${
                mode === key
                  ? "bg-[var(--ratist-red)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              <span className="text-sm font-semibold block">{label}</span>
              <span className={`text-[10px] block mt-0.5 ${mode === key ? "text-white/70" : "text-[var(--foreground-muted)]"}`}>{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Controls row (only for standard/critic) */}
      {mode !== "basic" && (
        <div className="flex items-center justify-between mb-6">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setRequiredOnly((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${requiredOnly ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${requiredOnly ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm text-[var(--foreground-muted)]">Required fields only</span>
          </label>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Overall Rating */}
        <div className={`bg-[var(--surface)] border-2 rounded-xl p-6 ${overallRating != null ? "border-[var(--ratist-red)]" : "border-[var(--ratist-red)]/40"}`}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-base font-bold text-white">
              Overall Rating <span className="text-[var(--ratist-red)]">*</span>
            </label>
            <span className={`text-3xl font-black ${overallRating != null ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)]"}`}>
              {overallRating ?? "—"}
            </span>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mb-4">
            Your gut feeling about this {ratingScope === "season" ? `season` : "show"} overall — how much did you enjoy it?
          </p>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={overallRating ?? 5}
              onChange={(e) => setOverallRating(parseFloat(e.target.value))}
              onPointerDown={() => { if (overallRating == null) setOverallRating(5); }}
              className={`flex-1 ${overallRating != null ? "accent-[var(--ratist-red)]" : "accent-gray-500"}`}
            />
            {overallRating != null && (
              <button type="button" onClick={() => setOverallRating(null)} className="text-[var(--foreground-muted)] hover:text-red-400 text-xs" title="Clear">✕</button>
            )}
          </div>
          <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
            <span>1 — Poor</span><span>10 — Excellent</span>
          </div>
        </div>

        {/* Category sections */}
        {mode !== "basic" && (
          <>
            {Object.entries(CRITERIA).map(([catName, cat]) => (
              <div key={catName} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenSections((s) => ({ ...s, [catName]: !s[catName] }))}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--surface-2)] transition-colors"
                >
                  <span className="font-semibold text-white">{catName}</span>
                  <span className="text-[var(--foreground-muted)] text-sm">{openSections[catName] ? "▲" : "▼"}</span>
                </button>

                {openSections[catName] && (
                  <div className="px-5 pb-5 space-y-5 border-t border-[var(--border)]">
                    {cat.fields.filter((f) => !requiredOnly || f.required).map((field) => (
                      <div key={field.key} className="pt-4">
                        <div className="flex items-center gap-2 mb-1">
                          <label className="text-sm font-medium text-white">
                            {field.label}
                            {field.required && <span className="text-[var(--ratist-red)] ml-1">*</span>}
                          </label>
                          {field.key === "superficialAllure" && (
                            <span className="text-xs text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded">not scored</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)] mb-3">{field.desc}</p>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={0.5}
                            value={values[field.key] ?? 5}
                            onChange={(e) => setValue(field.key, parseFloat(e.target.value))}
                            onPointerDown={() => { if (values[field.key] == null) setValue(field.key, 5); }}
                            className={`flex-1 ${values[field.key] != null ? "accent-[var(--ratist-red)]" : "accent-gray-500"}`}
                          />
                          <span className={`text-sm font-bold w-8 text-right ${values[field.key] != null ? "text-white" : "text-[var(--foreground-muted)]"}`}>
                            {values[field.key] ?? "—"}
                          </span>
                          {values[field.key] != null && (
                            <button type="button" onClick={() => setValues((v) => ({ ...v, [field.key]: null }))} className="text-[var(--foreground-muted)] hover:text-red-400 text-xs" title="Clear">✕</button>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
                          <span>1 — Poor</span><span>10 — Excellent</span>
                        </div>
                        {mode === "critic" && (
                          <textarea
                            value={fieldComments[field.key] ?? ""}
                            onChange={(e) => setFieldComments((c) => ({ ...c, [field.key]: e.target.value }))}
                            placeholder={`Your thoughts on ${field.label.toLowerCase()}...`}
                            rows={2}
                            className="mt-2 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-none"
                          />
                        )}
                      </div>
                    ))}

                    {mode === "critic" && (
                      <div className="pt-4 border-t border-[var(--border)]/30">
                        <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block mb-2">
                          {catName} — Summary
                        </label>
                        <textarea
                          value={categoryComments[cat.key] ?? ""}
                          onChange={(e) => setCategoryComments((c) => ({ ...c, [cat.key]: e.target.value }))}
                          placeholder={`Summarize your thoughts on ${catName.toLowerCase()}...`}
                          rows={3}
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Review text */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <label className="block text-sm font-semibold text-white mb-2">Written Review <span className="text-[var(--foreground-muted)] font-normal text-xs">(optional)</span></label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder={`Share your thoughts on this ${ratingScope === "season" ? "season" : "show"}...`}
            rows={4}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={hasSpoilers} onChange={(e) => setHasSpoilers(e.target.checked)} className="accent-[var(--ratist-red)]" />
              <span className="text-xs text-[var(--foreground-muted)]">Contains spoilers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={commentsDisabled} onChange={(e) => setCommentsDisabled(e.target.checked)} className="accent-[var(--ratist-red)]" />
              <span className="text-xs text-[var(--foreground-muted)]">Disable comments on this review</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : mode === "basic" ? "Submit Quick Rating" : "Submit Ratings"}
            </button>
            <button
              type="button"
              onClick={() => { if (window.history.length <= 1) { window.close(); } else { router.back(); } }}
              disabled={submitting}
              className="px-6 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--foreground-muted)]">
              {showSaved ? (
                <span className="text-green-400 transition-opacity">Draft saved</span>
              ) : (
                "Your progress is auto-saved locally"
              )}
            </p>
            <button
              type="button"
              onClick={clearDraft}
              className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
            >
              Clear form
            </button>
          </div>
          {hasExisting && (
            confirmDelete ? (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <span className="text-sm text-red-400 flex-1">Delete this rating and review permanently?</span>
                <button
                  type="button"
                  onClick={deleteRating}
                  disabled={deleting}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full border border-[var(--border)] text-[var(--foreground-muted)] hover:border-red-400 hover:text-red-400 text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Delete Rating
              </button>
            )
          )}
        </div>
      </form>
    </div>
  );
}
