"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { useSearchParams } from "next/navigation";
import { Search, Film, Users, ExternalLink, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";

interface PersonResult { id: number; name: string; profile_path: string | null; known_for_department: string }
interface ContentSearchResult { id: number; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string; mediaType: "movie" | "tv" }
interface CastMember { id: number; name: string; profile_path: string | null; character?: string; job?: string; known_for_department?: string }
interface SeenItem { tmdbId: number; title: string; posterPath: string | null; character?: string; job?: string; ratistRating?: number | null; mediaType: "movie" | "tv" }

type SearchMode = "person" | "content";

const LOOKUP_KEY = "ratist-actor-lookup-state";

function ActorLookupContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  // Restore from sessionStorage on mount
  const restored = typeof window !== "undefined" ? (() => { try { return JSON.parse(sessionStorage.getItem(LOOKUP_KEY) ?? "{}"); } catch { return {}; } })() : {};

  const [mode, setMode] = useState<SearchMode>(restored.mode ?? "person");

  // Person-first search
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(restored.selectedPerson ?? null);
  const [seenItems, setSeenItems] = useState<SeenItem[] | null>(restored.seenItems ?? null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Content-first search
  const [contentQuery, setContentQuery] = useState("");
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentSearchResult | null>(restored.selectedContent ?? null);
  const [castList, setCastList] = useState<CastMember[] | null>(restored.castList ?? null);
  const [loadingCast, setLoadingCast] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Persist state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(LOOKUP_KEY, JSON.stringify({
        mode, selectedPerson, seenItems, selectedContent, castList,
      }));
    } catch { /* ignore */ }
  }, [mode, selectedPerson, seenItems, selectedContent, castList]);

  const [personPage, setPersonPage] = useState(1);
  const [personHasMore, setPersonHasMore] = useState(false);
  const [lastPersonQuery, setLastPersonQuery] = useState("");

  async function searchPerson(q: string, page = 1) {
    setPersonQuery(q);
    setError(null);
    if (q.length < 2) { setPersonResults([]); setPersonHasMore(false); return; }
    if (page === 1) setLastPersonQuery(q);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}`);
      const data = await res.json();
      const newResults = data.results ?? [];
      setPersonResults(page === 1 ? newResults : (prev) => [...prev, ...newResults]);
      setPersonPage(page);
      setPersonHasMore(page < (data.total_pages ?? 1));
    } catch {
      setPersonResults([]);
      setError("Failed to search people. Please try again.");
    }
  }

  async function selectPerson(person: PersonResult) {
    setSelectedPerson(person);
    setPersonResults([]);
    setPersonQuery(person.name);
    if (!user) { setSeenItems([]); return; }
    setLoadingItems(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/tools/actor-lookup?personId=${person.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Combine movies and shows into one list
    const movies = (data.movies ?? []).map((m: SeenItem) => ({ ...m, mediaType: "movie" as const }));
    const shows = (data.shows ?? []).map((s: SeenItem) => ({ ...s, mediaType: "tv" as const }));
    setSeenItems([...movies, ...shows]);
    setLoadingItems(false);
  }

  const [contentPage, setContentPage] = useState(1);
  const [contentHasMore, setContentHasMore] = useState(false);
  const [lastContentQuery, setLastContentQuery] = useState("");

  async function searchContent(q: string, page = 1) {
    setContentQuery(q);
    if (page === 1) { setSelectedContent(null); setCastList(null); }
    setError(null);
    if (q.length < 2) { setContentResults([]); setContentHasMore(false); return; }
    if (page === 1) setLastContentQuery(q);
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}`),
        fetch(`https://api.themoviedb.org/3/search/tv?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&page=${page}`),
      ]);
      const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
      const movies = (movieData.results ?? []).map((m: ContentSearchResult) => ({ ...m, mediaType: "movie" as const }));
      const shows = (tvData.results ?? []).map((s: ContentSearchResult) => ({ ...s, mediaType: "tv" as const }));
      const newResults = [...movies, ...shows];
      setContentResults(page === 1 ? newResults : (prev) => [...prev, ...newResults]);
      setContentPage(page);
      setContentHasMore(page < (movieData.total_pages ?? 1) || page < (tvData.total_pages ?? 1));
    } catch {
      setContentResults([]);
      setError("Failed to search content. Please try again.");
    }
  }

  async function selectContent(item: ContentSearchResult) {
    setSelectedContent(item);
    setContentResults([]);
    setContentQuery(item.title ?? item.name ?? "");
    setLoadingCast(true);
    setError(null);
    try {
      const endpoint = item.mediaType === "tv"
        ? `https://api.themoviedb.org/3/tv/${item.id}/aggregate_credits?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
        : `https://api.themoviedb.org/3/movie/${item.id}/credits?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`;
      const res = await fetch(endpoint);
      const data = await res.json();

      let cast: CastMember[];
      if (item.mediaType === "tv") {
        // TV aggregate credits have roles[] array
        cast = [
          ...(data.cast ?? []).slice(0, 20).map((p: { id: number; name: string; profile_path: string | null; roles?: { character: string }[] }) => ({
            id: p.id, name: p.name, profile_path: p.profile_path,
            character: p.roles?.[0]?.character,
            known_for_department: "Acting",
          })),
          ...(data.crew ?? []).filter((p: { department?: string }) => ["Directing", "Writing", "Production"].includes(p.department ?? "")).slice(0, 10).map((p: { id: number; name: string; profile_path: string | null; jobs?: { job: string }[] }) => ({
            id: p.id, name: p.name, profile_path: p.profile_path,
            job: p.jobs?.[0]?.job,
            known_for_department: p.jobs?.[0]?.job,
          })),
        ];
      } else {
        cast = [
          ...(data.cast ?? []).slice(0, 20).map((p: CastMember) => ({ ...p, known_for_department: "Acting" })),
          ...(data.crew ?? []).filter((p: CastMember & { department?: string }) => ["Directing", "Writing"].includes(p.department ?? "")).slice(0, 10).map((p: CastMember) => ({ ...p, known_for_department: p.job })),
        ];
      }
      setCastList(cast);
    } catch {
      setCastList([]);
      setError("Failed to load cast information. Please try again.");
    }
    setLoadingCast(false);
  }

  function switchMode(newMode: SearchMode) {
    setMode(newMode);
    setPersonQuery(""); setPersonResults([]); setSelectedPerson(null); setSeenItems(null);
    setContentQuery(""); setContentResults([]); setSelectedContent(null); setCastList(null);
  }

  // When clicking a cast member from content-first mode, save the content state
  // so that if the user navigates away and comes back, the person results show.
  // The content state is preserved separately so a manual "back to cast list" works.
  const [previousContentState, setPreviousContentState] = useState<{
    selectedContent: ContentSearchResult | null;
    castList: CastMember[] | null;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(sessionStorage.getItem(`${LOOKUP_KEY}-prev`) ?? "null"); } catch { return null; }
  });

  function selectPersonFromCast(person: PersonResult) {
    // Save current content state so user can go "back to cast list"
    const prev = { selectedContent, castList };
    setPreviousContentState(prev);
    try { sessionStorage.setItem(`${LOOKUP_KEY}-prev`, JSON.stringify(prev)); } catch { /* ignore */ }
    setMode("person");
    setSelectedContent(null);
    setCastList(null);
    setTimeout(() => selectPerson(person), 0);
  }

  function backToCastList() {
    if (!previousContentState) return;
    setMode("content");
    setSelectedContent(previousContentState.selectedContent);
    setCastList(previousContentState.castList);
    setSelectedPerson(null);
    setSeenItems(null);
    setPreviousContentState(null);
    try { sessionStorage.removeItem(`${LOOKUP_KEY}-prev`); } catch { /* ignore */ }
  }

  // Auto-select person from URL params. Two important guards:
  //   1. sessionStorage wins over the URL. The URL is a stale snapshot
  //      of "the celebrity selected earlier in this tab"; if the user
  //      has since switched to a different celebrity, sessionStorage
  //      has the fresh state. Without this guard, navigating away
  //      and back rewinds to whoever's in the URL.
  //   2. Wait until auth has finished loading before triggering the
  //      lookup. selectPerson reads `user`; if auth is still resolving
  //      it falls into the `!user` branch and stamps seenItems = [],
  //      giving a "0 results" view even when the user is signed in.
  const hasRestoredPerson = restored.selectedPerson != null;
  useEffect(() => {
    if (authLoading) return;
    if (hasRestoredPerson) return;
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
  }, [authLoading]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Film className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">What Else Do I Know Them From?</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Search an actor or director to see only the movies and shows you&apos;ve seen or rated.</p>

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-sm text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to see results filtered to your watched movies and shows.
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
          onClick={() => switchMode("content")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "content" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
        >
          <Users className="w-3.5 h-3.5" /> Search by Movie or Show
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6 text-sm text-red-400">{error}</div>
      )}

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
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden max-h-72 overflow-y-auto">
                {personResults.map((p) => (
                  <button key={p.id} onClick={() => selectPerson(p)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left">
                    {p.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w45${p.profile_path}`} alt="" width={32} height={32} className="rounded-full w-8 h-8 object-cover object-top shrink-0" />
                    ) : <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] shrink-0 flex items-center justify-center text-sm">&#x1f464;</div>}
                    <div>
                      <p className="text-sm text-white">{p.name}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{p.known_for_department}</p>
                    </div>
                  </button>
                ))}
                {personHasMore && (
                  <button onClick={() => searchPerson(lastPersonQuery, personPage + 1)} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
                    Load more results...
                  </button>
                )}
              </div>
            )}
          </div>

          {selectedPerson && (
            <div>
              <div className="flex items-center gap-4 mb-4">
                {previousContentState && (
                  <button
                    onClick={backToCastList}
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    &larr; Back to {previousContentState.selectedContent?.title ?? previousContentState.selectedContent?.name ?? "cast list"}
                  </button>
                )}
                <Link
                  href={`/celebrities/${selectedPerson.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View {selectedPerson.name}&apos;s full filmography &rarr;
                </Link>
              </div>

              {loadingItems ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">Searching your watched movies &amp; shows...</p>
              ) : seenItems === null ? null : seenItems.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">
                  You haven&apos;t seen or rated any movies or shows featuring {selectedPerson.name}.
                </p>
              ) : (
                <div>
                  {(() => {
                    const movieCount = seenItems.filter((m) => m.mediaType === "movie").length;
                    const showCount = seenItems.filter((m) => m.mediaType === "tv").length;
                    const rated = seenItems.filter((m): m is SeenItem & { ratistRating: number } => m.ratistRating != null);
                    const avg = rated.length > 0 ? rated.reduce((s, m) => s + m.ratistRating, 0) / rated.length : null;
                    const countText = [
                      movieCount > 0 ? `${movieCount} movie${movieCount !== 1 ? "s" : ""}` : null,
                      showCount > 0 ? `${showCount} show${showCount !== 1 ? "s" : ""}` : null,
                    ].filter(Boolean).join(" and ");
                    return (
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-[var(--foreground-muted)]">
                          {countText} you&apos;ve seen with {selectedPerson.name}
                          {avg != null && <> &middot; avg rating <span className="text-white font-semibold">{avg.toFixed(1)}</span></>}
                        </p>
                        <ShareButton
                          label="Share"
                          text={`I've seen ${countText} with ${selectedPerson.name}${avg != null ? ` (avg rating ${avg.toFixed(1)})` : ""} on The Ratist!`}
                          url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/tools/actor-lookup?personId=${selectedPerson.id}&name=${encodeURIComponent(selectedPerson.name)}`}
                          cardImageUrl={`/api/og/actor-lookup?personId=${selectedPerson.id}&name=${encodeURIComponent(selectedPerson.name)}&count=${seenItems.length}${avg != null ? `&avg=${avg.toFixed(1)}` : ""}`}
                        />
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {seenItems.map((m) => (
                      <Link key={`${m.mediaType}-${m.tmdbId}`} href={`/${m.mediaType === "tv" ? "shows" : "movies"}/${m.tmdbId}`} className="group">
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w185")} alt={m.title} fill sizes="160px" className="object-cover" />
                          ) : <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>}
                          {m.mediaType === "tv" && (
                            <div className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                              <Tv className="w-2.5 h-2.5" />
                              <span className="text-[8px] font-bold leading-none">TV</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-white mt-1.5 line-clamp-1 font-medium">{m.title}</p>
                        {m.character ? (
                          <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">as {m.character}</p>
                        ) : m.job ? (
                          <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">({m.job})</p>
                        ) : null}
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
              value={contentQuery}
              onChange={(e) => searchContent(e.target.value)}
              placeholder="Search for a movie or show..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            {contentResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden max-h-72 overflow-y-auto">
                {contentResults.map((item) => (
                  <button key={`${item.mediaType}-${item.id}`} onClick={() => selectContent(item)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left">
                    {item.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w45${item.poster_path}`} alt="" width={30} height={45} className="rounded w-8 object-cover shrink-0" />
                    ) : <div className="w-8 h-10 rounded bg-[var(--surface-2)] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.title ?? item.name}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {(item.release_date ?? item.first_air_date)?.slice(0, 4)}
                      </p>
                    </div>
                    {item.mediaType === "tv" && (
                      <span className="text-[9px] font-bold text-blue-400 bg-blue-600/20 px-1.5 py-0.5 rounded shrink-0">TV</span>
                    )}
                  </button>
                ))}
                {contentHasMore && (
                  <button onClick={() => searchContent(lastContentQuery, contentPage + 1)} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
                    Load more results...
                  </button>
                )}
              </div>
            )}
          </div>

          {selectedContent && (
            <div>
              {loadingCast ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">Loading cast...</p>
              ) : castList === null ? null : castList.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-10">No cast information found.</p>
              ) : (
                <div>
                  <p className="text-sm text-[var(--foreground-muted)] mb-4">
                    Cast & crew for <span className="text-white font-medium">{selectedContent.title ?? selectedContent.name}</span> — click a person to look them up
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {castList.map((p) => (
                      <button
                        key={`${p.id}-${p.character ?? p.job}`}
                        onClick={() => selectPersonFromCast({ id: p.id, name: p.name, profile_path: p.profile_path, known_for_department: p.known_for_department ?? "Acting" })}
                        className="group text-left"
                      >
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                          {p.profile_path ? (
                            <Image src={`https://image.tmdb.org/t/p/w185${p.profile_path}`} alt={p.name} fill sizes="160px" className="object-cover object-top" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">&#x1f464;</div>
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
