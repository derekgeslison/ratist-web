"use client";

import { useState, useCallback, useEffect, useLayoutEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Film, Tv } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/score-color";
import { resolveCommunityScore } from "@/lib/community-score";
import CategoryScoreBar from "./CategoryScoreBar";
import RatingBadge from "./RatingBadge";
import ShareButton from "./ShareButton";
import ProfileDiaryTab from "./ProfileDiaryTab";
import PosterOverlay from "./PosterOverlay";

interface RatedMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** TMDB community avg — primary source for the community badge. */
  voteAverage: number | null;
  /** Ratist's own community avg — fallback when voteAverage is missing. */
  ratistAvg?: number | null;
  ratistRating: number | null;
  reviewText: string | null;
  createdAt: string;
  ratingStatus: "complete" | "incomplete" | "imported";
  mediaType?: "movie" | "tv";
}

interface SeenMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  seenAt: string;
  watchedDate: string | null;
  ratistRating: number | null;
  /** TMDB community vote average. Primary source for the community badge. */
  voteAverage?: number | null;
  /** Ratist's own community avg (mean of MovieRating.ratistRating across
   *  users). Fallback shown when voteAverage is missing — e.g. obscure
   *  titles TMDB hasn't aggregated yet. */
  ratistAvg?: number | null;
  ratingStatus: "complete" | "incomplete" | "imported" | null;
  mediaType?: "movie" | "tv";
}

interface WatchlistMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  ratistRating: number | null;
  mediaType?: "movie" | "tv";
}

interface SimilarUser {
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null; isPrivate: boolean };
  overallMatch: number;
}

interface Recommendation {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  avgRating: number;
}

interface Profile {
  [key: string]: number | string | undefined;
}

interface StatsData {
  ratingCount: number;
  movieRatingCount?: number;
  tvRatingCount?: number;
  avgRating: number | null;
  tvAvgRating?: number | null;
  seenCount: number;
  movieSeenCount?: number;
  tvSeenCount?: number;
  watchlistCount: number;
  ratingDistribution: { range: string; count: number }[];
  tvRatingDistribution?: { range: string; count: number }[];
  genreBreakdown: { name: string; count: number; avg: number }[];
  tvGenreBreakdown?: { name: string; count: number; avg: number }[];
  totalEpisodesWatched?: number;
}

interface UserWatchlistInfo {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  movieCount: number;
  previewMovies?: { tmdbId: number; title: string; posterPath: string | null }[];
}

interface EpisodeGroup {
  showTmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  watchedDate: string | null;
  seasonCount: number;
  episodeCount: number;
  seasons: { seasonNumber: number; episodeCount: number }[];
  episodes: { seasonNumber: number; episodeNumber: number; name: string | null }[];
  ratistRating?: number | null;
}

interface Props {
  ratings: RatedMovie[];
  seenMovies: SeenMovie[];
  episodeGroups?: EpisodeGroup[];
  watchlistMovies: WatchlistMovie[];
  defaultWatchlistId?: string | null;
  defaultWatchlistPrivate?: boolean;
  userWatchlists?: UserWatchlistInfo[];
  recommendations: Recommendation[];
  similarUsers: SimilarUser[];
  profile: Profile | null;
  /** User's average score per movie-rating sub-field (plot,
   *  storytelling, casting, etc.). Used to render per-field bars
   *  inside the expanded view of each preference component. */
  profileFieldAvgs?: Record<string, number | null>;
  stats: StatsData;
  componentLabels: Record<string, string>;
  genreLabels: Record<string, string>;
  profileFirebaseUid: string;
  profileUserId: string;
  profileUserName: string;
  isPrivate: boolean;
  publicTabs?: Record<string, boolean>;
  siteUrl?: string;
  savedRankings?: { tmdbId: number; title: string; posterPath: string | null; year: string; ratistRating: number | null }[];
  rankingsYear?: string;
  cineqStats?: { totalQuizzes: number; weightedLifetime: number; avgScore: number; avgWeightedScore: number; bestScore: number; bestWeightedScore: number } | null;
  movieClubMember?: boolean;
  movieClubWeeksParticipated?: number;
}

const TABS = ["Overview", "Ratings", "Diary", "Watchlist", "Rankings", "Stats"] as const;
type Tab = (typeof TABS)[number];

function WatchlistCard({ name, movieCount, isPrivate, movies, href, isOwnProfile, isEmpty }: {
  name: string;
  movieCount: number;
  isPrivate: boolean;
  movies: { tmdbId: number; title: string; posterPath: string | null; mediaType?: "movie" | "tv" }[];
  href?: string;
  isOwnProfile: boolean;
  isEmpty?: boolean;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {href ? (
            <Link href={href} className="text-sm font-semibold text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
              {name}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-[var(--foreground-muted)]">{name}</span>
          )}
          {isPrivate && <span className="text-[10px] text-[var(--foreground-muted)] opacity-60">Private</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--foreground-muted)]">{movieCount} title{movieCount !== 1 ? "s" : ""}</span>
          {href && movieCount > 0 && (
            <Link href={href} className="text-[11px] text-[var(--foreground)] hover:underline">View all →</Link>
          )}
        </div>
      </div>
      {isEmpty ? (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--foreground-muted)]">
            {isOwnProfile ? "No movies in this list yet." : "Empty list."}
          </p>
          {isOwnProfile && (
            <Link href="/movies" className="text-xs text-[var(--ratist-red)] hover:underline mt-1 inline-block">Browse movies →</Link>
          )}
        </div>
      ) : movies.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {movies.slice(0, 8).map((m) => (
            <Link
              key={`${m.mediaType ?? "movie"}-${m.tmdbId}`}
              href={`/${m.mediaType === "tv" ? "shows" : "movies"}/${m.tmdbId}`}
              className="group"
            >
              <PosterOverlay tmdbId={m.tmdbId} title={m.title} posterPath={m.posterPath} mediaType={m.mediaType ?? "movie"} showRatings>
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1">
                  <Image src={m.posterPath ? posterUrl(m.posterPath, "w185") : "/placeholder-poster.svg"} alt={m.title} fill sizes="100px" className="object-cover" />
                  {m.mediaType === "tv" && (
                    <div className="absolute top-1 left-1 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                      <Tv className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-bold leading-none">TV</span>
                    </div>
                  )}
                </div>
              </PosterOverlay>
              <p className="text-[11px] text-[var(--foreground-muted)] line-clamp-1">{m.title}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProfileTabs({
  ratings,
  seenMovies,
  episodeGroups = [],
  watchlistMovies,
  defaultWatchlistId,
  defaultWatchlistPrivate = false,
  userWatchlists = [],
  recommendations,
  similarUsers,
  profile,
  profileFieldAvgs,
  stats,
  componentLabels,
  genreLabels,
  profileFirebaseUid,
  profileUserId,
  profileUserName,
  isPrivate,
  publicTabs = {},
  siteUrl = "https://theratist.com",
  savedRankings = [],
  rankingsYear,
  cineqStats,
  movieClubMember,
  movieClubWeeksParticipated = 0,
}: Props) {
  const { user } = useAuth();
  const isOwnProfile = !!user && user.uid === profileFirebaseUid;

  // Live follow status for the current viewer. Drives whether a
  // private-profile visitor sees content (accepted followers do)
  // and which set of tab toggles is applied. Refetched whenever the
  // Firebase user reference changes (sign-in / out / different user).
  const [isAcceptedFollower, setIsAcceptedFollower] = useState(false);
  useEffect(() => {
    if (!user || isOwnProfile) { setIsAcceptedFollower(false); return; }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/users/${profileFirebaseUid}/follow`, { headers: { Authorization: `Bearer ${token}` } })
    ).then((r) => r.ok ? r.json() : null).then((data) => {
      if (!cancelled) setIsAcceptedFollower(data?.followStatus === "accepted");
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [user, profileFirebaseUid, isOwnProfile]);

  // "Suggested for you" sections — fetched once when viewing someone
  // else's profile while signed in. Lists movies the profile owner rated
  // highly, gated by either shared component preferences (≥2 axes both
  // ≥7.5) or shared genre preferences (≥1 axis both ≥7.0).
  type SuggestionItem = { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; ratistAvg: number | null; ratistRating: number; mediaType: "movie" | "tv" };
  const [suggestions, setSuggestions] = useState<{ shared: { components: string[]; genres: string[] }; componentSuggestions: SuggestionItem[]; genreSuggestions: SuggestionItem[] } | null>(null);
  useEffect(() => {
    if (!user || isOwnProfile) { setSuggestions(null); return; }
    let cancelled = false;
    user.getIdToken()
      .then((token) => fetch(`/api/profile/${profileFirebaseUid}/suggestions`, { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data && !data.error) setSuggestions(data); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [user, profileFirebaseUid, isOwnProfile]);

  // Default all tabs to public, then apply user overrides
  const defaultPublic: Record<string, boolean> = { overview: true, ratings: true, diary: true, watchlist: true, stats: true, rankings: true };
  const tabVisibility: Record<string, boolean> = { ...defaultPublic, ...publicTabs };

  // For visitors (not own profile), filter to only public tabs. Owner sees all.
  // Accepted followers of a private profile use the same publicTabs
  // gate as visitors to a public profile would — owner can still
  // hide individual tabs from followers via their privacy toggles.
  const TAB_KEY_MAP: Record<Tab, string> = {
    Overview: "overview", Ratings: "ratings", Diary: "diary",
    Watchlist: "watchlist", Stats: "stats", Rankings: "rankings",
  };
  const visibleTabs = isOwnProfile
    ? TABS
    : isPrivate && !isAcceptedFollower
      ? [] // private profile, viewer not approved → no tabs
      : TABS.filter((t) => tabVisibility[TAB_KEY_MAP[t]]);

  function tabFromHash(): Tab {
    if (typeof window === "undefined") return visibleTabs[0] ?? "Overview";
    const hash = window.location.hash.slice(1).toLowerCase();
    const match = visibleTabs.find((t) => t.toLowerCase() === hash);
    return match ?? visibleTabs[0] ?? "Overview";
  }

  const [activeTab, setActiveTabState] = useState<Tab>(tabFromHash);

  useEffect(() => {
    function onHashChange() { setActiveTabState(tabFromHash()); }
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    setActiveTabState(tabFromHash());
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to top whenever this component mounts on a profile or the
  // profile UID changes.
  //
  // Why this is more aggressive than a plain useEffect:
  //   1. useLayoutEffect fires synchronously before paint, so the user
  //      doesn't see a flash of mid-page scroll from the source page.
  //   2. A trailing requestAnimationFrame call catches the case where
  //      the router/browser restores scroll AFTER React commits.
  //
  // Tradeoff: back-nav to a previously-visited profile will scroll to
  // top instead of restoring the prior scroll position. That's the
  // lesser evil compared to the user landing mid-page on a fresh
  // profile visit (which happened reliably when navigating from
  // long-scrolling source pages like /community).
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
    const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(raf);
  }, [profileFirebaseUid]);

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab);
    const hash = tab === (visibleTabs[0] ?? "Overview") ? "" : `#${tab.toLowerCase()}`;
    window.history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }
  const profileUrl = `${siteUrl}/profile/${profileFirebaseUid}`;
  const currentYear = new Date().getFullYear().toString();
  const prevYear = (new Date().getFullYear() - 1).toString();
  // Show the most recently active year — keep previous year visible until the user has
  // watched at least 5 movies in the new year (so Jan 1 doesn't wipe their stats).
  const seenCurrentYearCount = seenMovies.filter((m) => {
    const d = m.watchedDate ?? m.seenAt;
    return d && new Date(d).getFullYear().toString() === currentYear;
  }).length;
  const displayYear = seenCurrentYearCount >= 5 ? currentYear : prevYear;
  // Fall back to current year if there's no previous-year data at all
  const hasPrevYearData = seenMovies.some((m) => {
    const d = m.watchedDate ?? m.seenAt;
    return d && new Date(d).getFullYear().toString() === prevYear;
  });
  const activeYear = (seenCurrentYearCount < 5 && hasPrevYearData) ? prevYear : currentYear;
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

  // Mirrors lib/profile.ts FOCUSED_CATEGORIES — the rating sub-fields
  // that contribute to each component score. Each entry pairs the
  // database field name with a display label; the field name is
  // looked up against profileFieldAvgs (the user's averages across
  // all their ratings) so we can render the actual contributing
  // score next to each label.
  const COMPONENT_CONTRIBUTORS: Record<string, { key: string; label: string }[]> = {
    narrativeFocused: [
      { key: "plot", label: "Plot" },
      { key: "storytelling", label: "Storytelling" },
      { key: "pacingClimax", label: "Pacing & climax" },
      { key: "premiseOriginality", label: "Originality" },
    ],
    characterFocused: [
      { key: "relatability", label: "Relatability" },
      { key: "characterDev", label: "Character development" },
      { key: "dialogueScripting", label: "Dialogue & scripting" },
    ],
    messageFocused: [
      { key: "overallEmotion", label: "Emotion" },
      { key: "meaning", label: "Meaning" },
      { key: "movingness", label: "Movingness" },
    ],
    cinematicFocused: [
      { key: "cinematography", label: "Cinematography" },
      { key: "artisticEffect", label: "Artistic effect" },
      { key: "visualEffects", label: "Visual effects" },
      { key: "locationCost", label: "Locations & costume" },
      { key: "musicSound", label: "Music & sound" },
    ],
    performanceFocused: [
      { key: "casting", label: "Casting" },
      { key: "actingQuality", label: "Acting quality" },
      { key: "blockingChoreo", label: "Blocking & choreography" },
    ],
    entertainmentFocused: [
      { key: "appeal", label: "Appeal" },
      { key: "pacingClimax", label: "Pacing & climax" },
    ],
  };

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

  // Top rated movies seen in the active display year
  const topRatedThisYear = seenMovies
    .filter((m) => {
      const date = m.watchedDate ?? m.seenAt;
      return date && new Date(date).getFullYear().toString() === activeYear && m.ratistRating != null && m.ratistRating >= 6.5;
    })
    .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0))
    .slice(0, 10);

  // Movies seen in the active display year
  const seenThisYear = seenMovies.filter((m) => {
    // Only count movies with an explicit watchedDate (not createdAt fallback)
    return m.watchedDate && new Date(m.watchedDate).getFullYear().toString() === activeYear;
  }).length;

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
        {(isOwnProfile ? TABS : visibleTabs).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "bg-[var(--ratist-red)] text-white shadow-sm"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {tab}
            {tab === "Ratings" && stats.ratingCount > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab ? "bg-white/20 text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
              }`}>
                {stats.ratingCount}
              </span>
            )}
            {tab === "Diary" && stats.seenCount > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab ? "bg-white/20 text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
              }`}>
                {stats.seenCount}
              </span>
            )}
            {tab === "Watchlist" && stats.watchlistCount > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab ? "bg-white/20 text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
              }`}>
                {stats.watchlistCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── PRIVATE GATE ──
          Triggered when there's nothing to show. visibleTabs is
          already empty for unapproved viewers of a private profile;
          accepted followers fall through to the public-tab filter
          and only hit the gate if the owner has hidden every single
          tab from followers via publicTabs. */}
      {!isOwnProfile && visibleTabs.length === 0 ? (
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
      {activeTab === "Overview" && (() => {
        // Match-score tile shared by the mobile top-of-main and the
        // desktop sidebar. Mobile copy lives at the top of the main
        // column so the first thing a viewer sees is how their taste
        // lines up with this profile; desktop keeps it in the right
        // rail where it already sat. Extracted so the two positions
        // stay in lockstep if we later add/remove copy.
        const matchScoreTile = !isOwnProfile && matchScore !== null ? (
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
        ) : null;
        return (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Mobile-only match-score copy — sits above the
               component preferences so visitors don't have to scroll
               past several tiles to see it. Hidden on lg+ where the
               sidebar copy is visible instead. */}
            {matchScoreTile && <div className="lg:hidden">{matchScoreTile}</div>}

            {/* Component preferences */}
            {profile && topComponents.some((c) => c.score > 0) && (
              <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Movie Component Preferences</h2>
                <div className="space-y-2">
                  {topComponents.map((c) => {
                    const fields = COMPONENT_CONTRIBUTORS[c.key] ?? [];
                    const subFields = fields
                      .map((f) => ({ key: f.key, label: f.label, score: profileFieldAvgs?.[f.key] ?? null }))
                      .filter((f) => f.score != null);
                    return (
                      <CategoryScoreBar
                        key={c.key}
                        label={c.label}
                        score={c.score > 0 ? c.score : null}
                        subFields={subFields.length > 0 ? subFields : undefined}
                      />
                    );
                  })}
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

            {/* Recommendations — only show on own profile */}
            {recommendations.length > 0 && isOwnProfile && (
              <section>
                <h2 className="text-base font-semibold text-white mb-1">Recommended For You</h2>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">Based on similar taste profiles</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {recommendations.map((m) => (
                    <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="group flex flex-col">
                      <PosterOverlay tmdbId={m.tmdbId} title={m.title} posterPath={m.posterPath} releaseDate={m.releaseDate} voteAverage={m.voteAverage} showRatings>
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w185")} alt={m.title} fill sizes="120px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                          )}
                        </div>
                      </PosterOverlay>
                      <p className="text-xs font-medium text-white mt-1.5 line-clamp-1">{m.title}</p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4) ?? "—"}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recently rated — only complete ratings */}
            {ratings.filter((r) => r.ratingStatus === "complete").length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-4">Recently Rated</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {ratings.filter((r) => r.ratingStatus === "complete").slice(0, 12).map((r) => (
                    <Link key={r.id} href={`/${r.mediaType === "tv" ? "shows" : "movies"}/${r.tmdbId}`} className="group">
                      {/* No showRatings here — the badges below already
                          render the profile owner's community + ratist
                          scores. Adding showRatings duplicates them with
                          the viewer's perspective. */}
                      <PosterOverlay tmdbId={r.tmdbId} title={r.title} posterPath={r.posterPath} voteAverage={r.voteAverage} mediaType={r.mediaType ?? "movie"}>
                        <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {r.posterPath ? (
                            <Image src={posterUrl(r.posterPath, "w92")} alt={r.title} fill sizes="80px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                          )}
                        </div>
                      </PosterOverlay>
                      <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                        {(() => {
                          const cs = resolveCommunityScore(r.voteAverage, r.ratistAvg);
                          return cs != null ? <RatingBadge type="community" score={cs} size="sm" /> : null;
                        })()}
                        {r.ratistRating != null && (
                          <RatingBadge type="ratist" score={r.ratistRating} size="sm" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Top rated this year */}
            {topRatedThisYear.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-1">Top Rated in {activeYear}</h2>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">
                  {isOwnProfile ? "Your" : `${profileUserName}'s`} highest-rated watches of {activeYear}
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {topRatedThisYear.map((m, i) => (
                    <Link key={m.tmdbId} href={`${m.mediaType === "tv" ? "/shows" : "/movies"}/${m.tmdbId}`} className="group relative">
                      {/* showRatings off — community + owner's ratist badges below. */}
                      <PosterOverlay tmdbId={m.tmdbId} title={m.title} posterPath={m.posterPath} releaseDate={m.releaseDate} mediaType={m.mediaType ?? "movie"}>
                        <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="80px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                          )}
                          <div className="absolute top-1 left-1 w-5 h-5 rounded bg-black/70 flex items-center justify-center text-[10px] font-bold text-white">
                            {i + 1}
                          </div>
                        </div>
                      </PosterOverlay>
                      <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                        {(() => {
                          const cs = resolveCommunityScore(m.voteAverage, m.ratistAvg);
                          return cs != null ? <RatingBadge type="community" score={cs} size="sm" /> : null;
                        })()}
                        {m.ratistRating != null && (
                          <RatingBadge type="ratist" score={m.ratistRating} size="sm" />
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Suggested for you — component-shared.
                Only renders for visitors (not own profile) when both users
                share at least 2 component "focused" preferences above 7.5
                AND the owner has high-rated movies the viewer hasn't seen. */}
            {!isOwnProfile && suggestions && suggestions.componentSuggestions.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-1">
                  Suggested titles {profileUserName} rated highly that you may like
                </h2>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">
                  Based on the {suggestions.shared.components.length} component preferences you both score above 7.5, where {profileUserName}&apos;s rating scored above 7.5 in at least 2 of those shared dimensions.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {suggestions.componentSuggestions.map((m) => (
                    <Link key={`${m.mediaType}-${m.tmdbId}`} href={`${m.mediaType === "tv" ? "/shows" : "/movies"}/${m.tmdbId}`} className="group">
                      {/* showRatings: PosterOverlay renders community (TMDB or
                          Ratist-avg fallback) + the VIEWER's ratist (their own
                          rating, or predicted estimate if unrated). These are
                          "suggested FOR YOU" tiles — the owner's rating isn't
                          what the viewer cares about. */}
                      <PosterOverlay tmdbId={m.tmdbId} title={m.title} posterPath={m.posterPath} releaseDate={m.releaseDate} voteAverage={m.voteAverage} ratistAvg={m.ratistAvg} mediaType={m.mediaType} showRatings>
                        <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="80px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                          )}
                        </div>
                      </PosterOverlay>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Suggested for you — genre-shared. */}
            {!isOwnProfile && suggestions && suggestions.genreSuggestions.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-white mb-1">
                  Suggested titles based on your shared genre preferences
                </h2>
                <p className="text-xs text-[var(--foreground-muted)] mb-4">
                  In the {suggestions.shared.genres.length === 1 ? "genre" : `${suggestions.shared.genres.length} genres`} you both prefer (above 7.0), {profileUserName} rated these above 7.5.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {suggestions.genreSuggestions.map((m) => (
                    <Link key={`${m.mediaType}-${m.tmdbId}`} href={`${m.mediaType === "tv" ? "/shows" : "/movies"}/${m.tmdbId}`} className="group">
                      {/* See componentSuggestions above for why this is showRatings
                          rather than a manual owner-badge area. */}
                      <PosterOverlay tmdbId={m.tmdbId} title={m.title} posterPath={m.posterPath} releaseDate={m.releaseDate} voteAverage={m.voteAverage} ratistAvg={m.ratistAvg} mediaType={m.mediaType} showRatings>
                        <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                          {m.posterPath ? (
                            <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="80px" className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                          )}
                        </div>
                      </PosterOverlay>
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
            {/* Non-member CTA */}
            {!user && (
              <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-white mb-1">See how your taste compares</p>
                <p className="text-xs text-[var(--foreground-muted)] mb-3">
                  Create a free account to get your taste match score with {profileUserName}.
                </p>
                <SignInLink className="inline-block w-full bg-[var(--ratist-red)] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[var(--ratist-red)]/90 transition-colors text-center">
                  Join The Ratist
                </SignInLink>
                <SignInLink className="block mt-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                  Already a member? Sign in
                </SignInLink>
              </div>
            )}

            {/* Match score — sidebar position is desktop-only. The
               mobile copy renders at the top of the main column
               (see matchScoreTile above) so it lands above the fold. */}
            {matchScoreTile && <div className="hidden lg:block">{matchScoreTile}</div>}

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

            {/* "People similar to this profile owner" — only useful
               on your own profile. On someone else's profile the
               viewer doesn't care who's similar to them, and the
               list awkwardly includes the viewer themselves. The
               /community Discover surface (Taste Twins tab) is the
               proper home for this kind of discovery. */}
            {isOwnProfile && similarUsers.length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Similar Taste Profiles</h3>
                <div className="space-y-3">
                  {similarUsers.filter((s) => !s.user.isPrivate).map((s) => (
                    <Link key={s.user.id} href={`/profile/${s.user.firebaseUid}`} className="flex items-center gap-3 group">
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

          {/* Cine-Q stats */}
          {cineqStats && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="text-lg">🧠</span> Cine-Q
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2 py-3 text-center min-w-0">
                  <p className="text-base font-bold text-white whitespace-nowrap">{Math.round(cineqStats.weightedLifetime).toLocaleString()}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">Lifetime Pts</p>
                </div>
                <div
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2 py-3 text-center min-w-0"
                  title="Difficulty-weighted average (Hard 2x, Medium 1.5x, Easy 1x). Raw average below."
                >
                  <p className="text-base font-bold text-white">{cineqStats.avgWeightedScore.toFixed(1)}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{cineqStats.avgScore.toFixed(1)} raw</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Score</p>
                </div>
                <div
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2 py-3 text-center min-w-0"
                  title="Highest difficulty-weighted score. Raw best below."
                >
                  <p className="text-base font-bold text-white">{cineqStats.bestWeightedScore.toFixed(1)}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">{cineqStats.bestScore.toFixed(1)} raw</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Best Score</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2 py-3 text-center min-w-0">
                  <p className="text-base font-bold text-white">{cineqStats.totalQuizzes}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">Quizzes Played</p>
                </div>
              </div>
            </div>
          )}

          {/* Movie Club badge */}
          {movieClubMember && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="text-lg">🎬</span> Movie Club
              </h3>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4">
                <div className="bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-full px-3 py-1">
                  <span className="text-sm font-semibold text-[var(--ratist-red)]">Member</span>
                </div>
                <p className="text-sm text-[var(--foreground-muted)]">{movieClubWeeksParticipated} week{movieClubWeeksParticipated !== 1 ? "s" : ""} participated</p>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── RATINGS TAB ── */}
      {activeTab === "Ratings" && (
        <div>
          {isOwnProfile && (
            <div className="flex justify-between mb-3">
              {/* Foreground (text) color rather than accent — when a
                  user picks a low-contrast accent (e.g., black on
                  dark gray), accent-colored text becomes unreadable.
                  Profile-page nav links should always be legible. */}
              <Link href="/ratings" className="text-sm text-[var(--foreground)] hover:underline">
                View all ratings →
              </Link>
              <Link href="/profile/import" className="text-xs text-[var(--foreground-muted)] hover:text-white hover:underline">
                Import from Letterboxd / IMDb →
              </Link>
            </div>
          )}
          {ratings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">No ratings yet.</p>
              {isOwnProfile && (
                <div className="flex flex-col items-center gap-2">
                  <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
                  <Link href="/profile/import" className="text-sm text-[var(--foreground-muted)] hover:text-white hover:underline">
                    Import from Letterboxd or IMDb →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {ratings.map((r) => (
                <Link
                  key={r.id}
                  href={`/${r.mediaType === "tv" ? "shows" : "movies"}/${r.tmdbId}`}
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
                  </div>
                  {r.ratingStatus === "incomplete" ? (
                    <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border border-orange-400/50 text-orange-400">
                      Incomplete
                    </span>
                  ) : r.ratingStatus === "imported" ? (
                    <div className="flex items-center gap-1 shrink-0 group/tip relative">
                      {r.ratistRating != null && (
                        <span className="text-sm font-bold" style={{ color: scoreColor(r.ratistRating) }}>
                          {r.ratistRating.toFixed(1)}
                        </span>
                      )}
                      <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <div className="absolute bottom-full right-0 mb-2 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2.5 text-xs text-[var(--foreground-muted)] shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-10">
                        Complete the full Ratist review to improve your taste profile accuracy.
                      </div>
                    </div>
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
        <ProfileDiaryTab
          seenMovies={seenMovies}
          episodeGroups={episodeGroups}
          isOwnProfile={isOwnProfile}
          profileFirebaseUid={profileFirebaseUid}
          activeYear={activeYear}
          seenThisYear={seenThisYear}
          siteUrl={siteUrl}
          watchedDates={watchedDates}
          updateWatchedDate={updateWatchedDate}
        />
      )}


      {/* ── WATCHLIST TAB ── */}
      {activeTab === "Watchlist" && (
        <div className="space-y-5">
          {isOwnProfile && (
            // Always render this link for the owner — even on an
            // empty watchlist they need a way to get to the manage
            // page. Foreground color so it stays legible regardless
            // of the user's chosen accent.
            <Link href="/watchlist" className="text-sm text-[var(--foreground)] hover:underline">
              Manage watchlists →
            </Link>
          )}

          {/* Default watchlist — hidden if private and not own profile */}
          {(!defaultWatchlistPrivate || isOwnProfile) && (
            <WatchlistCard
              name="Watchlist"
              movieCount={watchlistMovies.length}
              isPrivate={defaultWatchlistPrivate}
              movies={watchlistMovies.map((m) => ({ tmdbId: m.tmdbId, title: m.title, posterPath: m.posterPath }))}
              href={isOwnProfile ? "/watchlist" : (defaultWatchlistId ? `/watchlist/${defaultWatchlistId}/view` : undefined)}
              isOwnProfile={isOwnProfile}
              isEmpty={watchlistMovies.length === 0}
            />
          )}

          {/* Custom lists */}
          {userWatchlists
            .filter((wl) => !wl.isPrivate || isOwnProfile)
            .map((wl) => (
              <WatchlistCard
                key={wl.id}
                name={wl.name}
                movieCount={wl.movieCount}
                isPrivate={wl.isPrivate}
                movies={wl.previewMovies ?? []}
                href={isOwnProfile ? "/watchlist" : `/watchlist/${wl.id}/view`}
                isOwnProfile={isOwnProfile}
              />
            ))}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {activeTab === "Stats" && (
        <div className="space-y-8">
          {/* Movies summary */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Film className="w-4 h-4" /> Movies
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.movieSeenCount ?? stats.seenCount}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Seen</p>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.movieRatingCount ?? stats.ratingCount}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Rated</p>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: stats.avgRating ? scoreColor(stats.avgRating) : undefined }}>
                  {stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Rating</p>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.watchlistCount}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Watchlisted</p>
              </div>
            </div>
          </div>

          {/* TV Shows summary */}
          {((stats.tvRatingCount ?? 0) > 0 || (stats.tvSeenCount ?? 0) > 0) && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Tv className="w-4 h-4 text-blue-400" /> TV Shows
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats.tvSeenCount ?? 0}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Shows Seen</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats.tvRatingCount ?? 0}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Shows Rated</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: stats.tvAvgRating ? scoreColor(stats.tvAvgRating) : undefined }}>
                    {stats.tvAvgRating ? stats.tvAvgRating.toFixed(1) : "—"}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Rating</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats.totalEpisodesWatched ?? 0}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">Episodes</p>
                </div>
              </div>
            </div>
          )}

          {/* Movie ratings distribution */}
          {stats.ratingDistribution.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">
                Movie Rating Distribution
              </h2>
              <div className="space-y-2">
                {stats.ratingDistribution.map(({ range, count }) => {
                  const maxCount = Math.max(...stats.ratingDistribution.map((r) => r.count));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={range} className="flex items-center gap-3">
                      <span className="text-xs text-[var(--foreground-muted)] w-14 text-right shrink-0">{range}</span>
                      <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-[var(--ratist-red)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-[var(--foreground-muted)] w-6 shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* TV rating distribution */}
          {(stats.tvRatingDistribution ?? []).length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">
                TV Show Rating Distribution
              </h2>
              <div className="space-y-2">
                {(stats.tvRatingDistribution ?? []).map(({ range, count }) => {
                  const maxCount = Math.max(...(stats.tvRatingDistribution ?? []).map((r) => r.count));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={range} className="flex items-center gap-3">
                      <span className="text-xs text-[var(--foreground-muted)] w-14 text-right shrink-0">{range}</span>
                      <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-[var(--foreground-muted)] w-6 shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Movie genre breakdown */}
          {stats.genreBreakdown.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Movie Genres</h2>
              <div className="space-y-2">
                {stats.genreBreakdown.map(({ name, count, avg }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-white w-28 shrink-0 line-clamp-1">{name}</span>
                    <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-[var(--ratist-red)] rounded-full" style={{ width: `${(count / (stats.genreBreakdown[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)] w-8 shrink-0 text-right">{count}</span>
                    {avg > 0 && (
                      <span className="text-xs font-semibold w-8 shrink-0 text-right" style={{ color: scoreColor(avg) }}>{avg.toFixed(1)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TV genre breakdown */}
          {(stats.tvGenreBreakdown ?? []).length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">TV Show Genres</h2>
              <div className="space-y-2">
                {(stats.tvGenreBreakdown ?? []).map(({ name, count, avg }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-white w-28 shrink-0 line-clamp-1">{name}</span>
                    <div className="flex-1 bg-[var(--surface-2)] rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(count / ((stats.tvGenreBreakdown ?? [])[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)] w-8 shrink-0 text-right">{count}</span>
                    {avg > 0 && (
                      <span className="text-xs font-semibold w-8 shrink-0 text-right" style={{ color: scoreColor(avg) }}>{avg.toFixed(1)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.ratingCount === 0 && (stats.tvRatingCount ?? 0) === 0 && (
            <div className="text-center py-12 text-[var(--foreground-muted)]">
              <p>Stats will appear once {isOwnProfile ? "you've" : "they've"} rated some movies or shows.</p>
            </div>
          )}
        </div>
      )}

      {/* ── RANKINGS TAB ── */}
      {activeTab === "Rankings" && (() => {
        // Use saved rankings if available, otherwise fall back to rating-sorted
        const displayRankings = savedRankings.length > 0
          ? savedRankings
          : rankedMovies.map((r) => ({ tmdbId: r.tmdbId, title: r.title, posterPath: r.posterPath, year: new Date(r.createdAt).getFullYear().toString(), ratistRating: r.ratistRating }));
        const listLabel = savedRankings.length > 0 && rankingsYear ? `${rankingsYear} Rankings` : "Rankings";
        const listKey = savedRankings.length > 0 && rankingsYear ? rankingsYear : "all-time";
        const rankingsUrl = `${siteUrl}/profile/${profileFirebaseUid}/rankings/${listKey}`;
        return (
        <div>
          {isOwnProfile && (
            <div className="mb-3">
              <Link href={`/profile/${profileFirebaseUid}/rankings/${listKey}`} className="text-sm text-[var(--foreground)] hover:underline">
                View all rankings →
              </Link>
            </div>
          )}
          {displayRankings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[var(--foreground-muted)] mb-3">
                {isOwnProfile ? "Rate some movies to build your rankings." : "No ranked movies yet."}
              </p>
              {isOwnProfile && (
                <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-4 gap-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  {savedRankings.length > 0
                    ? `${isOwnProfile ? "Your" : `${profileUserName}'s`} ${listLabel}`
                    : isOwnProfile ? "Sorted by your rating. Use the Rankings tool to customize." : `${profileUserName}'s top rated.`}
                </p>
                <div className="flex items-center gap-3 shrink-0">
                  {isOwnProfile && (
                    <Link href="/tools/rankings" className="text-xs text-[var(--foreground)] hover:underline">
                      Reorder →
                    </Link>
                  )}
                  {/* Share button lives on the dedicated /tools/rankings
                      page now — keeping it here duplicated the action and
                      cluttered the tab header. */}
                </div>
              </div>
              {displayRankings.map((r, index) => (
                <Link
                  key={`${r.tmdbId}-${index}`}
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
                    <p className="text-xs text-[var(--foreground-muted)]/60">{r.year}</p>
                  </div>
                  {r.ratistRating != null && (
                    <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(r.ratistRating) }}>
                      {r.ratistRating.toFixed(1)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      </>)}
    </div>
  );
}
