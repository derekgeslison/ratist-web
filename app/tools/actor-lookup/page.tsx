"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Film } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface PersonResult { id: number; name: string; profile_path: string | null; known_for_department: string }
interface SeenMovie { tmdbId: number; title: string; posterPath: string | null; character?: string; job?: string; ratistRating?: number | null }

export default function ActorLookupPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [seenMovies, setSeenMovies] = useState<SeenMovie[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function searchPerson(q: string) {
    setQuery(q);
    if (q.length < 2) { setPersonResults([]); return; }
    const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}`);
    const data = await res.json();
    setPersonResults((data.results ?? []).slice(0, 6));
  }

  async function selectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setPersonResults([]);
    setQuery(person.name);
    if (!user) { setSeenMovies([]); return; }
    setLoading(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/tools/actor-lookup?personId=${person.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSeenMovies(data.movies ?? []);
    setLoading(false);
  }

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

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          value={query}
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
          {loading ? (
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
    </div>
  );
}
