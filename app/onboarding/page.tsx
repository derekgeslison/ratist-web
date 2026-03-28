"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, ChevronRight, Film, Eye, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

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
  { key: "plotFocused", label: "Story & Plot", desc: "Narrative, pacing, twists" },
  { key: "visualFocused", label: "Visuals & Style", desc: "Cinematography, production design" },
  { key: "actingFocused", label: "Acting & Casting", desc: "Performances, chemistry" },
  { key: "originalityFocused", label: "Originality", desc: "Fresh ideas, unique approach" },
  { key: "messageFocused", label: "Message & Meaning", desc: "Themes, depth, impact" },
  { key: "characterFocused", label: "Characters", desc: "Development, relatability" },
  { key: "scriptFocused", label: "Script & Dialogue", desc: "Writing quality, wit" },
];

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
}

const TOTAL_STEPS = 4;

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8 justify-center">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        return (
          <div key={n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step > n ? "bg-green-500 text-white" : step === n ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
            }`}>
              {step > n ? <Check className="w-3.5 h-3.5" /> : n}
            </div>
            {n < TOTAL_STEPS && <div className={`w-8 h-0.5 ${step > n ? "bg-green-500" : "bg-[var(--border)]"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [componentScores, setComponentScores] = useState<Record<string, number>>(
    Object.fromEntries(COMPONENTS.map((c) => [c.key, 5]))
  );
  // Step 3: mark seen
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [seenMovieIds, setSeenMovieIds] = useState<Set<number>>(new Set());
  const [markingId, setMarkingId] = useState<number | null>(null);
  // Step 4: rate one
  const [selectedForRating, setSelectedForRating] = useState<TMDBMovie | null>(null);
  const [quickRating, setQuickRating] = useState<number>(7);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch popular movies for step 3
  useEffect(() => {
    if (step === 3) {
      fetch("/api/tmdb/movie/popular")
        .catch(() => null)
        .then((r) => r?.json())
        .then((data) => {
          if (data?.results) setPopularMovies(data.results.slice(0, 20));
        })
        .catch(() => {});
    }
  }, [step]);

  function toggleGenre(key: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function markSeen(movie: TMDBMovie) {
    if (!user || markingId === movie.id) return;
    setMarkingId(movie.id);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/movies/${movie.id}/seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date }),
      });
      setSeenMovieIds((prev) => new Set([...prev, movie.id]));
    } catch { /* continue */ }
    setMarkingId(null);
  }

  async function submitQuickRating() {
    if (!user || !selectedForRating || ratingSubmitted) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/movies/${selectedForRating.id}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedForRating.title,
          poster_path: selectedForRating.poster_path,
          release_date: selectedForRating.release_date,
          overallRating: quickRating,
          // Map overall to pillar scores so ratistRating gets computed
          plot: quickRating, premiseOriginality: quickRating, storytelling: quickRating,
          characterDev: quickRating, pacingClimax: quickRating,
          cinematography: quickRating, artisticEffect: quickRating,
          overallEmotion: quickRating, relatability: quickRating,
          casting: quickRating, actingQuality: quickRating,
          appeal: quickRating,
        }),
      });
      setRatingSubmitted(true);
    } catch { /* continue */ }
    setSaving(false);
  }

  async function savePrefsAndFinish() {
    if (!user) { router.push("/"); return; }
    setSaving(true);

    const payload: Record<string, number> = {};
    for (const g of GENRES) payload[g.key] = selectedGenres.has(g.key) ? 8 : 2;
    for (const c of COMPONENTS) payload[c.key] = componentScores[c.key];

    try {
      const token = await user.getIdToken();
      await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch { /* continue */ }

    router.push("/movies");
  }

  const seenList = popularMovies.filter((m) => seenMovieIds.has(m.id));

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src="/logo-full.png" alt="The Ratist" width={140} height={70} className="h-14 w-auto" />
          </Link>
        </div>

        <StepIndicator step={step} />

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">

          {/* ── STEP 1: Genre preferences ── */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">What genres do you love?</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-2">
                Select all that apply. This builds your taste profile so your Ratist scores are weighted toward what you care about.
              </p>
              <div className="flex flex-wrap gap-2 mb-8">
                {GENRES.map((g) => {
                  const selected = selectedGenres.has(g.key);
                  return (
                    <button
                      key={g.key}
                      onClick={() => toggleGenre(g.key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        selected
                          ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                          : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 inline mr-1" />}
                      {g.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setStep(2)} className="w-full mt-3 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP 2: Component weights ── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">What matters most to you?</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-2">
                Adjust these to shape your personal Ratist score. A story-lover and a visuals-lover will score the same movie differently — that&apos;s the point.
              </p>
              <div className="space-y-5 mb-8">
                {COMPONENTS.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <p className="text-sm font-medium text-white">{c.label}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{c.desc}</p>
                      </div>
                      <span className="text-sm font-bold text-[var(--ratist-red)] w-6 text-right">{componentScores[c.key]}</span>
                    </div>
                    <input
                      type="range" min={1} max={10} step={1}
                      value={componentScores[c.key]}
                      onChange={(e) => setComponentScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))}
                      className="w-full accent-[var(--ratist-red)] cursor-pointer"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 bg-[var(--surface-2)] hover:bg-[var(--border)] text-white font-semibold rounded-full border border-[var(--border)] transition-colors">Back</button>
                <button onClick={() => setStep(3)} className="flex-grow py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setStep(3)} className="w-full mt-3 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Skip for now</button>
            </div>
          )}

          {/* ── STEP 3: Mark movies seen ── */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Which of these have you seen?</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-1">
                Click to mark movies you&apos;ve watched. This helps calibrate your profile right away.
              </p>
              {seenMovieIds.size > 0 && (
                <p className="text-sm text-green-400 mb-3">{seenMovieIds.size} marked ✓</p>
              )}
              {popularMovies.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-sm py-4 text-center">Loading movies…</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-6 max-h-80 overflow-y-auto pr-1">
                  {popularMovies.map((movie) => {
                    const isSeen = seenMovieIds.has(movie.id);
                    const isMarking = markingId === movie.id;
                    return (
                      <button
                        key={movie.id}
                        onClick={() => markSeen(movie)}
                        disabled={isSeen || isMarking}
                        className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                          isSeen ? "border-green-500" : "border-transparent hover:border-[var(--ratist-red)]"
                        }`}
                      >
                        <div className="aspect-[2/3] bg-[var(--surface-2)]">
                          {movie.poster_path ? (
                            <Image src={posterUrl(movie.poster_path, "w92")} alt={movie.title} fill sizes="80px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-xs">{movie.title}</div>
                          )}
                        </div>
                        {isSeen && (
                          <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                            <Check className="w-6 h-6 text-white drop-shadow" />
                          </div>
                        )}
                        {isMarking && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        {!isSeen && !isMarking && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-3 bg-[var(--surface-2)] hover:bg-[var(--border)] text-white font-semibold rounded-full border border-[var(--border)] transition-colors">Back</button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-grow py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {seenMovieIds.size > 0 ? `Continue with ${seenMovieIds.size} marked` : "Continue"} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setStep(4)} className="w-full mt-3 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Skip for now</button>
            </div>
          )}

          {/* ── STEP 4: Rate one movie ── */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Rate your first movie</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                Pick one movie you&apos;ve seen and give it a quick score. You can do the full criteria-based rating later — this just gets things started.
              </p>

              {/* Pick from seen movies or any popular */}
              {!selectedForRating && (
                <>
                  {seenList.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-2">From movies you just marked</p>
                      <div className="flex flex-wrap gap-2">
                        {seenList.slice(0, 6).map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setSelectedForRating(m)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full text-sm text-white transition-colors"
                          >
                            {m.poster_path && (
                              <div className="relative w-5 h-7 rounded overflow-hidden shrink-0">
                                <Image src={posterUrl(m.poster_path, "w92")} alt="" fill sizes="20px" className="object-cover" />
                              </div>
                            )}
                            {m.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Or pick from popular</p>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {popularMovies.slice(0, 12).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedForRating(m)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full text-sm text-white transition-colors"
                        >
                          {m.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {selectedForRating && !ratingSubmitted && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-[var(--surface-2)] rounded-lg">
                    {selectedForRating.poster_path && (
                      <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden">
                        <Image src={posterUrl(selectedForRating.poster_path, "w92")} alt="" fill sizes="40px" className="object-cover" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">{selectedForRating.title}</p>
                      <button onClick={() => setSelectedForRating(null)} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">Change movie</button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-white">Your score</p>
                      <span className="text-2xl font-bold text-[var(--ratist-red)]">{quickRating.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={1} max={10} step={0.5}
                      value={quickRating}
                      onChange={(e) => setQuickRating(Number(e.target.value))}
                      className="w-full accent-[var(--ratist-red)] cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
                      <span>1 — Poor</span>
                      <span>5 — Average</span>
                      <span>10 — Masterpiece</span>
                    </div>
                  </div>

                  <button
                    onClick={submitQuickRating}
                    disabled={saving}
                    className="w-full py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                  >
                    <Star className="w-4 h-4 fill-white" /> {saving ? "Saving…" : "Submit Rating"}
                  </button>
                </div>
              )}

              {ratingSubmitted && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl mb-4">
                  <Check className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">Rating saved!</p>
                    <p className="text-xs text-[var(--foreground-muted)]">You can do the full criteria-based rating on the movie page anytime.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(3)} className="flex-1 py-3 bg-[var(--surface-2)] hover:bg-[var(--border)] text-white font-semibold rounded-full border border-[var(--border)] transition-colors">Back</button>
                <button
                  onClick={savePrefsAndFinish}
                  disabled={saving}
                  className="flex-grow py-3 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" /> {saving ? "Saving…" : "Start Exploring"}
                </button>
              </div>
              <button onClick={savePrefsAndFinish} className="w-full mt-3 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Skip rating for now</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
