"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Film, Users, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface PersonResult { id: number; name: string; profile_path: string | null; known_for_department: string }
interface MovieSearchResult { id: number; title: string; poster_path: string | null; release_date: string }
interface CastMember { id: number; name: string; profile_path: string | null; character?: string; job?: string; known_for_department?: string }
interface SeenMovie { tmdbId: number; title: string; posterPath: string | null; character?: string; job?: string; ratistRating?: number | null }

type SearchMode = "person" | "movie";

function ActorLookupContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<SearchMode>("person");

  // Person-first search
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [seenMovies, setSeenMovies] = useState<SeenMovie[] | null>(null);
  const [loadingMovies, setLoadingMovies] = useState(false);

  // Movie-first search
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieSearchResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult | null>(null);
  const [castList, setCastList] = useState<CastMember[] | null>(null);
  const [loadingCast, setLoadingCast] = useState(false);

  async function searchPerson(q: string) {
    setPersonQuery(q);
    if (q.length < 2) { setPersonResults([]); return; }
    const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}`);
    const data = await res.json();
    setPersonResults((data.results ?? []).slice(0, 6));
  }

  async function selectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setPersonResults([]);
    setPersonQuery(person.name);
    if (!user) { setSeenMovies([]); return; }
    setLoadingMovies(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/tools/actor-lookup?personId=${person.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSeenMovies(data.movies ?? []);
    setLoadingMovies(false);
  }

  async function searchMovie(q: string) {
    setMovieQuery(q);
    setSelectedMovie(null);
    setCastList(null);
    if (q.length < 2) { setMovieResults([]); return; }
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}`);
    const data = await res.json();
    setMovieResults((data.results ?? []).slice(0, 6));
  }

  async function selectMovie(movie: MovieSearchResult) {
    setSelectedMovie(movie);
    setMovieResults([]);
    setMovieQuery(movie.title);
    setLoadingCast(true);
    const res = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`);
    const data = await res.json();
    const cast: CastMember[] = [
      ...(data.cast ?? []).slice(0, 20).map((p: CastMember) => ({ ...p, known_for_department: "Acting" })),
      ...(data.crew ?? []).filter((p: CastMember & { department?: string }) => ["Directing", "Writing"].includes(p.department ?? "")).slice(0, 10).map((p: CastMember) => ({ ...p, known_for_department: p.job })),
    ];
    setCastList(cast);
    setLoadingCast(false);
  }

  function switchMode(newMode: SearchMode) {
    setMode(newMode);
    // Reset all state
    setPersonQuery(""); setPersonResults([]); setSelectedPerson(null); setSeenMovies(null);
    setMovieQuery(""); setMovieResults([]); setSelectedMovie(null); setCastList(null);
  }

  // Auto-select person from URL params (e.g. when coming from a celebrity page)
  useEffect(() => {
    const personId = searchParams.get("personId");
    const personName = searchParams.get("name");
    if (personId && personName) {
      const person: PersonResult = {
        id: Number(personId),
        name: personName,
        profile_path: null,
        known_for_department: "Acting",
      };
      setMode("person");
      selectPerson(person);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Film className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">What Else Do I Know Them From?</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Search an actor or director to see only the movies you&apos;ve seen or rated.</p>

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-sm text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see results filtered to your watched movies.
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => switchMode("person")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "person" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
        >
          <Search className="w-3.5 h-3.5" /> Search by Person
        </button>
        <button
          onClick={() => switchMode("movie")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "movie" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
        >
          <Users className="w-3.5 h-3.5" /> Search by Movie
        </button>
      </div>

      {mode === "person" ? (
        <>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              value={personQuery}
              onChange={(e) => searchPerson(e.target.value)}
              placeholder="Search for an actor, director, or filmmaker..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            {personResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden">
                {personResults.map((p) => (
                  <button key={p.id} onClick={() => selectPerson(p)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left">
                    {p.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w45${p.profile_path}`} alt="" width={32} height={32} className="rounded-full w-8 h-8 object-cover object-top shrink-0" />
                    ) : <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] shrink-0 flex items-center justify-center text-sm">👤</div>}
                    <div>
                      <p className="text-sm text-white">{p.name}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{p.known_for_department}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPerson && (
            <div>
              {/* Link to celebrity page — always visible when a person is selected */}
              <div className="mb-4">
                <Link
                  href={`/celebrities/${selectedPerson.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View {selectedPerson.name}&apos;s full filmography →
                </Link>
              </div>

              {loadingMovies ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">Searching your watched movies...</p>
              ) : seenMovies === null ? null : seenMovies.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">
                  You haven&apos;t seen or rated any movies featuring {selectedPerson.name}.
                </p>
              ) : (
                <div>
                  <p className="text-sm text-[var(--foreground-muted)] mb-4">{seenMovies.length} movie{seenMovies.length !== 1 ? "s" : ""} you&apos;ve seen with {selectedPerson.name}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {seenMovies.map((m) => (
                      <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="group">
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w185")} alt={m.title} fill sizes="160px" className="object-cover" />
                          ) : <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>}
                        </div>
                        <p className="text-xs text-white mt-1.5 line-clamp-1 font-medium">{m.title}</p>
                        {m.character && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">as {m.character}</p>}
                        {m.ratistRating && <p className="text-xs font-semibold text-[var(--ratist-red)]">Your rating: {m.ratistRating.toFixed(1)}</p>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              value={movieQuery}
              onChange={(e) => searchMovie(e.target.value)}
              placeholder="Search for a movie..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            {movieResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden">
                {movieResults.map((m) => (
                  <button key={m.id} onClick={() => selectMovie(m)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left">
                    {m.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w45${m.poster_path}`} alt="" width={30} height={45} className="rounded w-8 object-cover shrink-0" />
                    ) : <div className="w-8 h-10 rounded bg-[var(--surface-2)] shrink-0" />}
                    <div>
                      <p className="text-sm text-white">{m.title}</p>
                      {m.release_date && <p className="text-xs text-[var(--foreground-muted)]">{m.release_date.slice(0, 4)}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedMovie && (
            <div>
              {loadingCast ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">Loading cast...</p>
              ) : castList === null ? null : castList.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">No cast information found.</p>
              ) : (
                <div>
                  <p className="text-sm text-[var(--foreground-muted)] mb-4">
                    Cast & crew for <span className="text-white font-medium">{selectedMovie.title}</span> — click a person to look them up
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {castList.map((p) => (
                      <button
                        key={`${p.id}-${p.character ?? p.job}`}
                        onClick={() => { switchMode("person"); setTimeout(() => selectPerson({ id: p.id, name: p.name, profile_path: p.profile_path, known_for_department: p.known_for_department ?? "Acting" }), 0); }}
                        className="group text-left"
                      >
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                          {p.profile_path ? (
                            <Image src={`https://image.tmdb.org/t/p/w185${p.profile_path}`} alt={p.name} fill sizes="160px" className="object-cover object-top" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                          )}
                        </div>
                        <p className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{p.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{p.character ?? p.job}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ActorLookupPage() {
  return (
    <Suspense>
      <ActorLookupContent />
    </Suspense>
  );
}
