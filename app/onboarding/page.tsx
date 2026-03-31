"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, ChevronRight, Film, Eye, Star, Upload } from "lucide-react";
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
  { key: "narrativeFocused", label: "Narrative", desc: "Story, pacing, originality" },
  { key: "characterFocused", label: "Characters", desc: "Development, relatability" },
  { key: "messageFocused", label: "Message & Meaning", desc: "Themes, depth, emotional impact" },
  { key: "cinematicFocused", label: "Cinematic", desc: "Cinematography, visuals, music" },
  { key: "performanceFocused", label: "Performance", desc: "Acting, casting, choreography" },
  { key: "entertainmentFocused", label: "Entertainment", desc: "Appeal, pacing, engagement" },
];

// 35 well-known classics — fetched from TMDB when step 3 loads
const CLASSIC_IDS = [
  278,    // The Shawshank Redemption
  238,    // The Godfather
  155,    // The Dark Knight
  680,    // Pulp Fiction
  122,    // The Lord of the Rings: The Return of the King
  120,    // The Lord of the Rings: The Fellowship of the Ring
  13,     // Forrest Gump
  603,    // The Matrix
  27205,  // Inception
  157336, // Interstellar
  24428,  // The Avengers
  299536, // Avengers: Infinity War
  299534, // Avengers: Endgame
  329,    // Jurassic Park
  597,    // Titanic
  671,    // Harry Potter and the Sorcerer's Stone
  12444,  // Harry Potter and the Deathly Hallows – Part 2
  8587,   // The Lion King (1994)
  11,     // Star Wars: Episode IV – A New Hope
  1891,   // Star Wars: Episode V – The Empire Strikes Back
  105,    // Back to the Future
  424,    // Schindler's List
  550,    // Fight Club
  769,    // GoodFellas
  274,    // The Silence of the Lambs
  49026,  // The Dark Knight Rises
  862,    // Toy Story
  12,     // Finding Nemo
  14160,  // Up
  10681,  // WALL-E
  129,    // Spirited Away
  313369, // La La Land
  120467, // The Grand Budapest Hotel
  68718,  // Django Unchained
  98,     // Gladiator
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
  const [recentMovies, setRecentMovies] = useState<TMDBMovie[]>([]);
  const [classicMovies, setClassicMovies] = useState<TMDBMovie[]>([]);
  const [seenMovieIds, setSeenMovieIds] = useState<Set<number>>(new Set());
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [moviesLoading, setMoviesLoading] = useState(false);
  // Step 4: rate one
  const [selectedForRating, setSelectedForRating] = useState<TMDBMovie | null>(null);
  const [quickRating, setQuickRating] = useState<number>(7);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [componentsTouched, setComponentsTouched] = useState(false);

  const allMovies = [...recentMovies, ...classicMovies];

  // Fetch movies for step 3
  useEffect(() => {
    if (step !== 3) return;
    setMoviesLoading(true);

    Promise.all([
      // 15 recent popular
      fetch("/api/tmdb/movie/popular")
        .then((r) => r.json())
        .then((d) => (d?.results as TMDBMovie[] ?? []).slice(0, 15))
        .catch(() => [] as TMDBMovie[]),
      // 35 classics
      fetch(`/api/tmdb/movies?ids=${CLASSIC_IDS.join(",")}`)
        .then((r) => r.json())
        .then((d) => (d?.results as TMDBMovie[] ?? []))
        .catch(() => [] as TMDBMovie[]),
    ]).then(([recent, classics]) => {
      setRecentMovies(recent);
      setClassicMovies(classics);
      setMoviesLoading(false);
    });
  }, [step]);

  function toggleGenre(key: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function toggleSeen(movie: TMDBMovie) {
    if (!user || markingId === movie.id) return;
    setMarkingId(movie.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/movies/${movie.id}/seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date }),
      });
      const data = await res.json();
      setSeenMovieIds((prev) => {
        const next = new Set(prev);
        if (data.seen) next.add(movie.id);
        else next.delete(movie.id);
        return next;
      });
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
          // No pillar scores — creates an incomplete rating the user can fill in later
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
    for (const g of GENRES) payload[g.key] = selectedGenres.has(g.key) ? 8 : 5;
    if (componentsTouched) {
      for (const c of COMPONENTS) payload[c.key] = componentScores[c.key];
    }

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

  const seenList = allMovies.filter((m) => seenMovieIds.has(m.id));

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
                      onChange={(e) => { setComponentsTouched(true); setComponentScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) })); }}
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
              {moviesLoading ? (
                <p className="text-[var(--foreground-muted)] text-sm py-4 text-center">Loading movies…</p>
              ) : (
                <div className="max-h-96 overflow-y-auto pr-1 mb-4 space-y-4">
                  {recentMovies.length > 0 && (
                    <div>
                      <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sticky top-0 bg-[var(--surface)] py-0.5 z-10">Recent &amp; Popular</p>
                      <div className="grid grid-cols-5 gap-2">
                        {recentMovies.map((movie) => <MovieTile key={movie.id} movie={movie} isSeen={seenMovieIds.has(movie.id)} isMarking={markingId === movie.id} onMark={toggleSeen} />)}
                      </div>
                    </div>
                  )}
                  {classicMovies.length > 0 && (
                    <div>
                      <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sticky top-0 bg-[var(--surface)] py-0.5 z-10">All-Time Classics</p>
                      <div className="grid grid-cols-5 gap-2">
                        {classicMovies.map((movie) => <MovieTile key={movie.id} movie={movie} isSeen={seenMovieIds.has(movie.id)} isMarking={markingId === movie.id} onMark={toggleSeen} />)}
                      </div>
                    </div>
                  )}
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

          {/* ── STEP 4: Import or rate one movie ── */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Add your ratings</h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-5">
                Jumpstart your profile by importing existing ratings or giving a movie a quick score.
              </p>

              {/* Import card — prominent */}
              <div className="mb-5 p-4 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] border-2 border-[var(--ratist-red)]/40 hover:border-[var(--ratist-red)] rounded-xl transition-colors group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--ratist-red)]/10 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-[var(--ratist-red)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white mb-0.5">Already use Letterboxd or IMDb?</h3>
                    <p className="text-xs text-[var(--foreground-muted)] mb-3">
                      Import your full watch history in seconds — all your ratings, instantly on Ratist. No need to start from scratch.
                    </p>
                    <Link
                      href="/profile/import"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      Import Ratings <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border)]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-[var(--surface)] text-[var(--foreground-muted)]">or rate your first movie</span>
                </div>
              </div>

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
                      {allMovies.slice(0, 15).map((m) => (
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
                  <p className="text-xs text-center text-[var(--foreground-muted)]">
                    This saves as an incomplete rating — you can fill in the full criteria on the movie page anytime.
                  </p>
                </div>
              )}

              {ratingSubmitted && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl mb-4">
                  <Check className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">Rating saved!</p>
                    <p className="text-xs text-[var(--foreground-muted)]">Complete the full criteria-based rating on the movie page whenever you&apos;re ready.</p>
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
              <button onClick={savePrefsAndFinish} className="w-full mt-3 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">Skip for now</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MovieTile({
  movie,
  isSeen,
  isMarking,
  onMark,
}: {
  movie: TMDBMovie;
  isSeen: boolean;
  isMarking: boolean;
  onMark: (m: TMDBMovie) => void;
}) {
  return (
    <button
      onClick={() => onMark(movie)}
      disabled={isMarking}
      className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
        isSeen ? "border-green-500 hover:border-red-400" : "border-transparent hover:border-[var(--ratist-red)]"
      }`}
    >
      <div className="aspect-[2/3] bg-[var(--surface-2)]">
        {movie.poster_path ? (
          <Image src={posterUrl(movie.poster_path, "w92")} alt={movie.title} fill sizes="80px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-xs p-1 text-center leading-tight">{movie.title}</div>
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
}
