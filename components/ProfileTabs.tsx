"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";
import CategoryScoreBar from "./CategoryScoreBar";

interface RatedMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  ratistRating: number | null;
  reviewText: string | null;
  createdAt: string;
  ratingStatus: "complete" | "incomplete";
}

interface SeenMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  seenAt: string;
  watchedDate: string | null;
  ratistRating: number | null;
  ratingStatus: "complete" | "incomplete" | null;
}

interface WatchlistMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
}

interface SimilarUser {
  user: { id: string; name: string; avatarUrl: string | null; isPrivate: boolean };
  overallMatch: number;
}

interface Recommendation {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  avgRating: number;
}

interface Profile {
  [key: string]: number | string | undefined;
}

interface StatsData {
  ratingCount: number;
  avgRating: number | null;
  seenCount: number;
  watchlistCount: number;
  ratingDistribution: { range: string; count: number }[];
  genreBreakdown: { name: string; count: number; avg: number }[];
}

interface Props {
  ratings: RatedMovie[];
  seenMovies: SeenMovie[];
  watchlistMovies: WatchlistMovie[];
  recommendations: Recommendation[];
  similarUsers: SimilarUser[];
  profile: Profile | null;
  stats: StatsData;
  componentLabels: Record<string, string>;
  genreLabels: Record<string, string>;
  profileFirebaseUid: string;
  profileUserId: string;
  isPrivate: boolean;
}

const TABS = ["Overview", "Ratings", "Diary", "Watchlist", "Stats", "Rankings"] as const;
type Tab = (typeof TABS)[number];

export default function ProfileTabs({
  ratings,
  seenMovies,
  watchlistMovies,
  recommendations,
  similarUsers,
  profile,
  stats,
  componentLabels,
  genreLabels,
  profileFirebaseUid,
  profileUserId,
  isPrivate,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  // Track locally-edited watched dates so the UI updates immediately
  const [watchedDates, setWatchedDates] = useState<Record<number, string | null>>({});
  const [matchScore, setMatchScore] = useState<number | null>(null);

  useEffect(() => {
    if (!user || isOwnProfile) return;
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/profile/match?targetUserId=${profileUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((data) => {
      if (!cancelled) setMatchScore(data.match ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, isOwnProfile, profileUserId]);

  const updateWatchedDate = useCallback(async (tmdbId: number, dateStr: string | null) => {
    if (!user) return;
    setWatchedDates((prev) => ({ ...prev, [tmdbId]: dateStr }));
    const token = await user.getIdToken();
    await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ watchedDate: dateStr }),
    }).catch(() => {});
  }, [user]);

  const componentKeys = Object.keys(componentLabels);
  const genreKeys = Object.keys(genreLabels);

  const topComponents = profile
    ? componentKeys
        .map((k) => ({ key: k, label: componentLabels[k], score: profile[k] as number ?? 0 }))
        .sort((a, b) => b.score - a.score)
    : [];

  const topGenres = profile
    ? genreKeys
        .map((k) => ({ key: k, label: genreLabels[k], score: profile[k] as number ?? 0 }))
        .filter((g) => g.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 9)
    : [];

  // Ranked list: ratings sorted by ratistRating desc
  const rankedMovies = [...ratings]
    .filter((r) => r.ratistRating !== null)
    .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0));

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-8 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "border-[var(--ratist-red)] text-white"
                : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {tab}
            {tab === "Ratings" && stats.ratingCount > 0 && (
              <span className="ml-1.5 text-xs bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded-full">
                {stats.ratingCount}
              </span>
            )}
            {tab === "Diary" && stats.seenCount > 0 && (
              <span className="ml-1.5 text-xs bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded-full">
                {stats.seenCount}
              </span>
            )}
            {tab === "Watchlist" && stats.watchlistCount > 0 && (
              <span className="ml-1.5 text-xs bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded-full">
                {stats.watchlistCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── PRIVATE GATE ── */}
      {isPrivate && !isOwnProfile ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-[var(--foreground-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-white mb-1">This profile is private</p>
          <p className="text-sm text-[var(--foreground-muted)]">Only the account owner can view this content.</p>
        </div>
      ) : (<>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "Overview" && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Component preferences */}
            {profile && topComponents.some((c) => c.score > 0) && (
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Movie Component Preferences</h2>
                <div className="space-y-2">
                  {topComponents.map((c) => (
                    <CategoryScoreBar key={c.key} label={c.label} score={c.score > 0 ? c.score : null} />
                  ))}
                </div>
              </section>
            )}

            {/* Genre preferences */}
            {topGenres.length > 0 && (
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Genre Preferences</h2>
                <div className="space-y-2">
                  {topGenres.map((g) => (
                    <CategoryScoreBar key={g.key} label={g.label} score={g.score} />
                  ))}
                </div>
              </section>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-1">Recommended For You</h2>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">Based on similar taste profiles</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {recommendations.map((m) => (
                    <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="group">
                      <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                        {m.posterPath ? (
                          <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="80px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                        )}
                      </div>
                      <p className="text-center text-xs mt-1 font-semibold" style={{ color: scoreColor(m.avgRating) }}>
                        {m.avgRating.toFixed(1)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recently rated */}
            {ratings.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-4">Recently Rated</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {ratings.slice(0, 12).map((r) => (
                    <Link key={r.id} href={`/movies/${r.tmdbId}`} className="group">
                      <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                        {r.posterPath ? (
                          <Image src={posterUrl(r.posterPath, "w92")} alt={r.title} fill sizes="80px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                        )}
                      </div>
                      {r.ratistRating && (
                        <p className="text-center text-xs mt-1 font-semibold" style={{ color: scoreColor(r.ratistRating) }}>
                          {r.ratistRating.toFixed(1)}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {ratings.length === 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
                <p className="text-[var(--foreground-muted)] mb-3">
                  {isOwnProfile ? "You haven't rated any movies yet." : "No ratings yet."}
                </p>
                {isOwnProfile && (
                  <div className="flex flex-col items-center gap-2">
                    <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">
                      Browse movies and start rating →
                    </Link>
                    <Link href="/profile/import" className="text-sm text-[var(--foreground-muted)] hover:text-white hover:underline">
                      Import from Letterboxd or IMDb →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Match score (shown to logged-in viewers of other profiles) */}
            {!isOwnProfile && matchScore !== null && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Your taste match</p>
                <p
                  className="text-3xl font-bold"
                  style={{ color: matchScore >= 80 ? "#22c55e" : matchScore >= 60 ? "#eab308" : "var(--foreground-muted)" }}
                >
                  {matchScore}%
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  {matchScore >= 80 ? "Very similar taste" : matchScore >= 60 ? "Good overlap" : "Different tastes"}
                </p>
              </div>
            )}

            {(!profile || topComponents.every((c) => c.score === 0)) && isOwnProfile && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <p className="text-sm text-[var(--foreground-muted)]">
                  Rate more movies to build your taste profile and unlock personalized recommendations.
                </p>
                <Link href="/movies" className="mt-3 inline-block text-sm text-[var(--ratist-red)] hover:underline">
                  Browse movies →
                </Link>
              </div>
            )}

            {topGenres.slice(0, 5).length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Top Genres</h3>
                <div className="flex flex-wrap gap-2">
                  {topGenres.slice(0, 5).map((g) => (
                    <span
                      key={g.key}
                      className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)]"
                      style={{ color: scoreColor(g.score) }}
                    >
                      {g.label} {g.score.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {similarUsers.length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Similar Taste Profiles</h3>
                <div className="space-y-3">
                  {similarUsers.filter((s) => !s.user.isPrivate).map((s) => (
                    <Link key={s.user.id} href={`/profile/${s.user.id}`} className="flex items-center gap-3 group">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
                        {s.user.avatarUrl ? (
                          <Image src={s.user.avatarUrl} alt="" fill sizes="32px" className="object-cover" unoptimized />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
                            {s.user.name[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{s.user.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{s.overallMatch}% match</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RATINGS TAB ── */}
      {activeTab === "Ratings" && (
        <div>
          {isOwnProfile && ratings.length > 0 && (
            <div className="flex justify-end mb-3">
              <Link href="/profile/import" className="text-xs text-[var(--foreground-muted)] hover:text-white hover:underline">
                Import from Letterboxd / IMDb →
              </Link>
            </div>
          )}
          {ratings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">No ratings yet.</p>
              {isOwnProfile && (
                <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {ratings.map((r) => (
                <Link
                  key={r.id}
                  href={`/movies/${r.tmdbId}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group"
                >
                  <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                    {r.posterPath && (
                      <Image src={posterUrl(r.posterPath, "w92")} alt={r.title} fill sizes="40px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{r.title}</p>
                    {r.reviewText && (
                      <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 mt-0.5">{r.reviewText}</p>
                    )}
                    <p className="text-xs text-[var(--foreground-muted)]/60 mt-0.5">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {r.ratingStatus === "incomplete" ? (
                    <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border border-orange-400/50 text-orange-400">
                      Incomplete
                    </span>
                  ) : r.ratistRating !== null ? (
                    <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(r.ratistRating) }}>
                      {r.ratistRating.toFixed(1)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DIARY TAB ── */}
      {activeTab === "Diary" && (
        <div>
          {isOwnProfile && (
            <p className="text-xs text-[var(--foreground-muted)] mb-4">
              Click the date on any entry to update when you watched it.
            </p>
          )}
          {seenMovies.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">
                {isOwnProfile ? "No movies marked as seen yet." : "No diary entries."}
              </p>
              {isOwnProfile && (
                <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Mark some movies as seen →</Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/30">
              {seenMovies.map((m, i) => {
                const displayDate = watchedDates[m.tmdbId] !== undefined
                  ? watchedDates[m.tmdbId]
                  : m.watchedDate;
                const dateValue = displayDate
                  ? new Date(displayDate).toISOString().split("T")[0]
                  : "";

                return (
                  <div key={i} className="flex items-center gap-3 py-3 group">
                    <Link href={`/movies/${m.tmdbId}`} className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                      {m.posterPath && (
                        <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="40px" className="object-cover" />
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/movies/${m.tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                        {m.title}
                      </Link>
                      <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                    </div>
                    {/* Rating badge */}
                    {m.ratingStatus === "incomplete" ? (
                      <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border border-orange-400/50 text-orange-400">
                        Incomplete
                      </span>
                    ) : m.ratistRating !== null ? (
                      <span
                        className="text-sm font-bold shrink-0 w-10 text-right"
                        style={{ color: scoreColor(m.ratistRating) }}
                      >
                        {m.ratistRating.toFixed(1)}
                      </span>
                    ) : null}
                    {/* Date — editable for own profile */}
                    {isOwnProfile ? (
                      <div className="shrink-0">
                        <input
                          type="date"
                          value={dateValue}
                          onChange={(e) => updateWatchedDate(m.tmdbId, e.target.value || null)}
                          className="text-xs text-[var(--foreground-muted)] bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--ratist-red)] focus:outline-none rounded px-1.5 py-0.5 cursor-pointer w-32 [color-scheme:dark]"
                          title="Edit watched date"
                        />
                        {!dateValue && (
                          <p className="text-xs text-[var(--foreground-muted)]/50 text-right">add date</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--foreground-muted)] shrink-0">
                        {displayDate ? new Date(displayDate).toLocaleDateString() : new Date(m.seenAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── WATCHLIST TAB ── */}
      {activeTab === "Watchlist" && (
        <div>
          {watchlistMovies.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">
                {isOwnProfile ? "Your watchlist is empty." : "No watchlist movies."}
              </p>
              {isOwnProfile && (
                <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {watchlistMovies.map((m, i) => (
                <Link key={i} href={`/movies/${m.tmdbId}`} className="group flex flex-col">
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                    {m.posterPath ? (
                      <Image src={posterUrl(m.posterPath, "w185")} alt={m.title} fill sizes="120px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white line-clamp-1">{m.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {activeTab === "Stats" && (
        <div className="space-y-8">
          {/* Summary numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-white">{stats.seenCount}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Movies Seen</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-white">{stats.ratingCount}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Ratings</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p
                className="text-3xl font-bold"
                style={{ color: stats.avgRating ? scoreColor(stats.avgRating) : undefined }}
              >
                {stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Rating</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-white">{stats.watchlistCount}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Watchlisted</p>
            </div>
          </div>

          {/* Ratings distribution */}
          {stats.ratingDistribution.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Rating Distribution</h2>
              <div className="space-y-2">
                {stats.ratingDistribution.map(({ range, count }) => {
                  const maxCount = Math.max(...stats.ratingDistribution.map((r) => r.count));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={range} className="flex items-center gap-3">
                      <span className="text-xs text-[var(--foreground-muted)] w-14 text-right shrink-0">{range}</span>
                      <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-[var(--ratist-red)] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[var(--foreground-muted)] w-6 shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Genre breakdown */}
          {stats.genreBreakdown.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Most Rated Genres</h2>
              <div className="space-y-2">
                {stats.genreBreakdown.map(({ name, count, avg }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-white w-28 shrink-0 line-clamp-1">{name}</span>
                    <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-[var(--ratist-red)] rounded-full"
                        style={{ width: `${(count / (stats.genreBreakdown[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)] w-8 shrink-0 text-right">{count}</span>
                    {avg > 0 && (
                      <span className="text-xs font-semibold w-8 shrink-0 text-right" style={{ color: scoreColor(avg) }}>
                        {avg.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.ratingCount === 0 && (
            <div className="text-center py-12 text-[var(--foreground-muted)]">
              <p>Stats will appear once {isOwnProfile ? "you've" : "they've"} rated some movies.</p>
            </div>
          )}
        </div>
      )}

      {/* ── RANKINGS TAB ── */}
      {activeTab === "Rankings" && (
        <div>
          {rankedMovies.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">
                {isOwnProfile ? "Rate some movies to build your rankings." : "No rated movies yet."}
              </p>
              {isOwnProfile && (
                <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {isOwnProfile && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-[var(--foreground-muted)]">Sorted by your rating. Use the Rankings tool to drag-and-drop reorder.</p>
                  <Link href="/tools/rankings" className="text-xs text-[var(--ratist-red)] hover:underline shrink-0 ml-4">
                    Reorder →
                  </Link>
                </div>
              )}
              {rankedMovies.map((r, index) => (
                <Link
                  key={r.id}
                  href={`/movies/${r.tmdbId}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-7 text-right shrink-0">
                    {index + 1}
                  </span>
                  <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                    {r.posterPath && (
                      <Image src={posterUrl(r.posterPath, "w92")} alt={r.title} fill sizes="32px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{r.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)]/60">{new Date(r.createdAt).getFullYear()}</p>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(r.ratistRating!) }}>
                    {r.ratistRating!.toFixed(1)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      </>)}
    </div>
  );
}
