"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, ArrowRight, ChevronDown, ChevronUp, Check, Eye, Tv, CalendarDays, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ShowCard from "./ShowCard";
import {
  posterUrl,
  type TMDBShow,
  type TMDBShowCastMember,
  type TMDBShowCrewMember,
  type TMDBImage,
  type TMDBWatchProvider,
  type TMDBSeason,
  type TMDBEpisode,
} from "@/lib/tmdb";
import TrailerModal from "./TrailerModal";
import WatchProviders from "./WatchProviders";
import RatingDistribution from "./RatingDistribution";
import ParentsGuide from "./ParentsGuide";
import Soundtrack from "./Soundtrack";
import AwardsTab from "./AwardsTab";
import ReviewCard from "./ReviewCard";
import RatingBadge from "./RatingBadge";
import type { AwardBodyGroup } from "@/lib/awards";
import DiscussionRow from "./DiscussionRow";
import ReviewDigest from "./ReviewDigest";

interface Discussion {
  id: string;
  title: string;
  slug: string;
  threadType: string;
  authorName: string;
  postCount: number;
  viewCount: number;
  createdAt: string;
  linkType?: "forum" | "news";
  linkHref?: string;
}

interface ShowReview {
  id: string;
  reviewText: string | null;
  ratistRating: number | null;
  overallRating: number | null;
  reviewType: string;
  ratingScope: string;
  seasonNumber: number;
  hasSpoilers: boolean;
  commentsDisabled: boolean;
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
  createdAt: string;
  likeCount: number;
  commentCount: number;
}

interface SeasonAggregate {
  ratingScope: string;
  seasonNumber: number;
  avg: { ratistRating: number | null; storyScore: number | null; styleScore: number | null; emotiveScore: number | null; actingScore: number | null; entertainScore: number | null };
  count: number;
}

interface Props {
  show: TMDBShow;
  trailerKey: string | null;
  cast: TMDBShowCastMember[];
  crew: TMDBShowCrewMember[];
  images: TMDBImage[];
  recommendations: TMDBShow[];
  streaming: TMDBWatchProvider[] | null;
  rent: TMDBWatchProvider[] | null;
  seasons: TMDBSeason[];
  discussions?: Discussion[];
  awards?: AwardBodyGroup[];
  tmdbId?: number;
  reviews?: ShowReview[];
  seasonAggregates?: SeasonAggregate[];
}

const TABS = ["Overview", "Cast & Crew", "Reviews", "Seasons", "Awards", "Media", "Discussions", "Parents' Guide"] as const;
type Tab = (typeof TABS)[number];

function FactRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-[var(--foreground-muted)] shrink-0 w-28">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function SeasonCard({
  season,
  showTmdbId,
  seenEpisodes,
  onToggleEpisode,
  onToggleSeason,
  onUpdateEpisodeDate,
  onUpdateSeasonDate,
  isLoggedIn,
  aggregate,
  isAiring,
}: {
  season: TMDBSeason;
  showTmdbId: number;
  seenEpisodes: Map<string, string | null>;
  onToggleEpisode: (seasonNumber: number, episodeNumber: number) => void;
  onToggleSeason: (seasonNumber: number, episodeCount: number, episodes: TMDBEpisode[]) => void;
  onUpdateEpisodeDate: (seasonNumber: number, episodeNumber: number, date: string | null) => void;
  onUpdateSeasonDate: (seasonNumber: number, episodes: TMDBEpisode[], date: string | null) => void;
  isLoggedIn: boolean;
  aggregate?: SeasonAggregate;
  /** True when this season is mid-broadcast — both
   *  next_episode_to_air and last_episode_to_air resolve to this
   *  season. Drives the "Currently Airing" pill on the row header. */
  isAiring?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<TMDBEpisode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedDescs, setExpandedDescs] = useState<Set<number>>(new Set());
  // Date picker state: "season" or episode number, plus pending date value
  const [datePickerOpen, setDatePickerOpen] = useState<"season" | number | null>(null);
  const [pendingDate, setPendingDate] = useState("");

  // Count seen episodes in this season — use seenEpisodes map directly so it works before expanding
  const seenCount = episodes
    ? episodes.filter((ep) => seenEpisodes.has(`${season.season_number}-${ep.episode_number}`)).length
    : Array.from(seenEpisodes.keys()).filter((key) => key.startsWith(`${season.season_number}-`)).length;
  const totalEpisodes = episodes?.length ?? season.episode_count;
  const allSeen = totalEpisodes > 0 && seenCount === totalEpisodes;

  async function toggleExpand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!episodes && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/shows/${showTmdbId}/season/${season.season_number}`);
        if (res.ok) {
          const data = await res.json();
          setEpisodes(data.episodes ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
  }

  return (
    <div className="border border-[var(--border)] rounded-lg">
      <div className="flex items-center gap-0">
        <button
          onClick={toggleExpand}
          className="flex-1 flex items-center gap-4 p-3 hover:bg-[var(--surface-2)] transition-colors text-left"
        >
          {season.poster_path ? (
            <div className="relative w-12 h-18 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
              <Image
                src={posterUrl(season.poster_path, "w92")}
                alt={season.name}
                width={48}
                height={72}
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-18 shrink-0 rounded bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--foreground-muted)]">
              S{season.season_number}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white">{season.name}</p>
              {isAiring && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" aria-hidden />
                  Currently Airing
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--foreground-muted)]">
              {season.episode_count} episode{season.episode_count !== 1 ? "s" : ""}
              {season.air_date ? ` · ${season.air_date.slice(0, 4)}` : ""}
            </p>
            {aggregate && aggregate.avg.ratistRating != null && (
              <div className="flex items-center gap-2 mt-0.5">
                <RatingBadge type="community" score={aggregate.avg.ratistRating} size="sm" />
                <span className="text-[10px] text-[var(--foreground-muted)]">
                  ({aggregate.count} rating{aggregate.count !== 1 ? "s" : ""})
                </span>
              </div>
            )}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />}
        </button>
        {isLoggedIn && (<>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              // If episodes not loaded yet, fetch them first
              if (!episodes) {
                setLoading(true);
                try {
                  const res = await fetch(`/api/shows/${showTmdbId}/season/${season.season_number}`);
                  if (res.ok) {
                    const data = await res.json();
                    const eps = data.episodes ?? [];
                    setEpisodes(eps);
                    if (eps.length > 0) onToggleSeason(season.season_number, season.episode_count, eps);
                  }
                } catch { /* ignore */ }
                setLoading(false);
                return;
              }
              if (episodes.length > 0) onToggleSeason(season.season_number, season.episode_count, episodes);
            }}
            className={`shrink-0 mr-3 flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
              allSeen
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-emerald-500/40 hover:text-emerald-400"
            }`}
            title={allSeen ? "Mark season as unwatched" : "Mark season as watched"}
          >
            <Eye className="w-3 h-3" />
            {`${seenCount}/${totalEpisodes}`}
          </button>
          {allSeen && (
            <div className="shrink-0 mr-3 relative">
              <button
                onClick={() => {
                  const firstKey = Array.from(seenEpisodes.keys()).find(k => k.startsWith(`${season.season_number}-`));
                  setPendingDate(firstKey ? seenEpisodes.get(firstKey) ?? "" : "");
                  setDatePickerOpen(datePickerOpen === "season" ? null : "season");
                }}
                className="text-[var(--foreground-muted)] hover:text-white transition-colors"
                title="Set watched date for season"
              >
                <CalendarDays className="w-3.5 h-3.5" />
              </button>
              {datePickerOpen === "season" && (
                <div className="absolute top-full right-0 mt-2 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-xl w-52">
                  <p className="text-xs text-[var(--foreground-muted)] mb-2">Watched date for season</p>
                  <input
                    type="date"
                    value={pendingDate}
                    onChange={(e) => setPendingDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] mb-2 w-full"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!pendingDate) return;
                        if (episodes) {
                          onUpdateSeasonDate(season.season_number, episodes, pendingDate);
                        } else {
                          try {
                            const res = await fetch(`/api/shows/${showTmdbId}/season/${season.season_number}`);
                            if (res.ok) {
                              const data = await res.json();
                              const eps = data.episodes ?? [];
                              setEpisodes(eps);
                              if (eps.length > 0) onUpdateSeasonDate(season.season_number, eps, pendingDate);
                            }
                          } catch { /* ignore */ }
                        }
                        setDatePickerOpen(null);
                      }}
                      disabled={!pendingDate}
                      className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-30"
                      title="Save date"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    {pendingDate && (
                      <button
                        onClick={async () => {
                          if (episodes) {
                            onUpdateSeasonDate(season.season_number, episodes, null);
                          } else {
                            try {
                              const res = await fetch(`/api/shows/${showTmdbId}/season/${season.season_number}`);
                              if (res.ok) {
                                const data = await res.json();
                                const eps = data.episodes ?? [];
                                setEpisodes(eps);
                                if (eps.length > 0) onUpdateSeasonDate(season.season_number, eps, null);
                              }
                            } catch { /* ignore */ }
                          }
                          setPendingDate("");
                          setDatePickerOpen(null);
                        }}
                        className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                        title="Remove date"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setDatePickerOpen(null)} className="ml-auto text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>)}
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-1)]">
          {season.overview && (
            <p className="text-xs text-[var(--foreground-muted)] px-4 py-3 leading-relaxed">{season.overview}</p>
          )}
          {loading ? (
            <p className="text-xs text-[var(--foreground-muted)] px-4 py-3">Loading episodes...</p>
          ) : episodes && episodes.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {episodes.map((ep) => {
                const key = `${season.season_number}-${ep.episode_number}`;
                const isSeen = seenEpisodes.has(key);
                return (
                  <div key={ep.id} className="flex items-start gap-3 px-4 py-3">
                    {ep.still_path ? (
                      <div className="relative w-24 aspect-video shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${ep.still_path}`}
                          alt={ep.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 aspect-video shrink-0 rounded bg-[var(--surface-2)] flex items-center justify-center text-[10px] text-[var(--foreground-muted)]">
                        E{ep.episode_number}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">
                        <span className="text-[var(--foreground-muted)] mr-1">{ep.episode_number}.</span>
                        {ep.name}
                      </p>
                      {ep.air_date && (
                        <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                          {ep.air_date}
                          {ep.runtime ? ` · ${ep.runtime}m` : ""}
                          {ep.vote_average > 0 ? ` · ${ep.vote_average.toFixed(1)}★` : ""}
                        </p>
                      )}
                      {ep.overview && (
                        <div className="mt-1">
                          <p className={`text-[11px] text-[var(--foreground-muted)] ${expandedDescs.has(ep.episode_number) ? "" : "line-clamp-2"}`}>{ep.overview}</p>
                          {ep.overview.length > 120 && (
                            <button
                              onClick={() => setExpandedDescs((prev) => {
                                const next = new Set(prev);
                                if (next.has(ep.episode_number)) next.delete(ep.episode_number); else next.add(ep.episode_number);
                                return next;
                              })}
                              className="text-[10px] text-[var(--ratist-red)] hover:underline mt-0.5"
                            >
                              {expandedDescs.has(ep.episode_number) ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {isLoggedIn && (<>
                      <button
                        onClick={() => onToggleEpisode(season.season_number, ep.episode_number)}
                        className={`shrink-0 mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                          isSeen
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                            : "border-[var(--border)] text-[var(--foreground-muted)]/30 hover:border-[var(--foreground-muted)] hover:text-[var(--foreground-muted)]"
                        }`}
                        title={isSeen ? "Mark as unwatched" : "Mark as watched"}
                      >
                        {isSeen ? <Check className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {isSeen && (
                        <div className="shrink-0 mt-0.5 relative">
                          <button
                            onClick={() => {
                              setPendingDate(seenEpisodes.get(key) ?? "");
                              setDatePickerOpen(datePickerOpen === ep.episode_number ? null : ep.episode_number);
                            }}
                            className="text-[var(--foreground-muted)] hover:text-white transition-colors"
                            title={seenEpisodes.get(key) ? `Watched: ${seenEpisodes.get(key)}` : "Set watched date"}
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                          </button>
                          {datePickerOpen === ep.episode_number && (
                            <div className="absolute top-full right-0 mt-2 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-xl w-52">
                              <p className="text-xs text-[var(--foreground-muted)] mb-2">When did you watch this?</p>
                              <input
                                type="date"
                                value={pendingDate}
                                onChange={(e) => setPendingDate(e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] mb-2 w-full"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (!pendingDate) return;
                                    onUpdateEpisodeDate(season.season_number, ep.episode_number, pendingDate);
                                    setDatePickerOpen(null);
                                  }}
                                  disabled={!pendingDate}
                                  className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-30"
                                  title="Save date"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                {(pendingDate || seenEpisodes.get(key)) && (
                                  <button
                                    onClick={() => {
                                      onUpdateEpisodeDate(season.season_number, ep.episode_number, null);
                                      setPendingDate("");
                                      setDatePickerOpen(null);
                                    }}
                                    className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                                    title="Remove date"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => setDatePickerOpen(null)} className="ml-auto text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>)}
                  </div>
                );
              })}
            </div>
          ) : episodes && episodes.length === 0 ? (
            <p className="text-xs text-[var(--foreground-muted)] px-4 py-3">No episode details available.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function ShowDetailTabs({
  show,
  trailerKey,
  cast,
  crew,
  images,
  recommendations,
  streaming,
  rent,
  seasons,
  discussions = [],
  awards = [],
  tmdbId,
  reviews = [],
  seasonAggregates = [],
}: Props) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  function tabToHash(tab: Tab): string {
    return tab.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-").replace(/'/g, "");
  }

  function hashToTab(): Tab {
    if (typeof window === "undefined") return "Overview";
    const hash = window.location.hash.slice(1);
    if (!hash) return "Overview";
    return TABS.find((t) => tabToHash(t) === hash) ?? "Overview";
  }

  const [activeTab, setActiveTabState] = useState<Tab>(hashToTab);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [showAllCast, setShowAllCast] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "series" | number>("all");

  useEffect(() => {
    function sync() { setActiveTabState(hashToTab()); }
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setActiveTab(tab: Tab) {
    setActiveTabState(tab);
    const hash = tab === "Overview" ? "" : `#${tabToHash(tab)}`;
    window.history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }
  // Map of "seasonNumber-episodeNumber" → watchedDate (ISO string or null)
  const [seenEpisodes, setSeenEpisodes] = useState<Map<string, string | null>>(new Map());

  // Fetch seen episodes on mount
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.episodes) {
          const map = new Map<string, string | null>();
          for (const ep of data.episodes) {
            map.set(`${ep.seasonNumber}-${ep.episodeNumber}`, ep.watchedDate?.slice(0, 10) ?? null);
          }
          setSeenEpisodes(map);
        }
      })
      .catch(() => {});
  }, [user, show.id]);

  const toggleEpisode = useCallback(
    async (seasonNumber: number, episodeNumber: number) => {
      if (!user) return;
      const key = `${seasonNumber}-${episodeNumber}`;
      const removing = seenEpisodes.has(key);
      setSeenEpisodes((prev) => {
        const next = new Map(prev);
        if (removing) next.delete(key);
        else next.set(key, null);
        return next;
      });
      const token = await user.getIdToken();
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "episodes",
          episodes: [{ seasonNumber, episodeNumber }],
          action: removing ? "remove" : "add",
        }),
      }).catch(() => {});
    },
    [seenEpisodes, show.id, user]
  );

  const updateEpisodeDate = useCallback(
    async (seasonNumber: number, episodeNumber: number, date: string | null) => {
      if (!user) return;
      const key = `${seasonNumber}-${episodeNumber}`;
      setSeenEpisodes((prev) => { const next = new Map(prev); next.set(key, date); return next; });
      const token = await user.getIdToken();
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "episodes", episodes: [{ seasonNumber, episodeNumber }], action: "update_date", watchedDate: date }),
      }).catch(() => {});
    },
    [show.id, user]
  );

  const updateSeasonDate = useCallback(
    async (seasonNumber: number, episodes: TMDBEpisode[], date: string | null) => {
      if (!user) return;
      setSeenEpisodes((prev) => {
        const next = new Map(prev);
        for (const ep of episodes) next.set(`${seasonNumber}-${ep.episode_number}`, date);
        return next;
      });
      const token = await user.getIdToken();
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "season", seasonNumber, action: "update_date", watchedDate: date }),
      }).catch(() => {});
    },
    [show.id, user]
  );

  const toggleSeason = useCallback(
    async (seasonNumber: number, episodeCount: number, episodes: TMDBEpisode[]) => {
      if (!user) return;
      const allSeen = episodes.every((ep) =>
        seenEpisodes.has(`${seasonNumber}-${ep.episode_number}`)
      );
      const action = allSeen ? "remove" : "add";
      setSeenEpisodes((prev) => {
        const next = new Map(prev);
        for (const ep of episodes) {
          const key = `${seasonNumber}-${ep.episode_number}`;
          if (allSeen) next.delete(key);
          else next.set(key, null);
        }
        return next;
      });
      const token = await user.getIdToken();
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "season",
          seasonNumber,
          episodes: episodes.map((ep) => ({
            seasonNumber,
            episodeNumber: ep.episode_number,
          })),
          action,
        }),
      }).catch(() => {});
    },
    [seenEpisodes, show.id, user]
  );

  // Extract key crew
  const creators = show.created_by ?? [];
  const executiveProducers = crew.filter((c) => c.jobs.some((j) => j.job === "Executive Producer")).slice(0, 6);
  const composers = crew.filter((c) => c.jobs.some((j) => j.job === "Original Music Composer"));

  const displayedCast = showAllCast ? cast : cast.slice(0, 18);

  // Filter out specials (season 0) for main display
  const mainSeasons = seasons.filter((s) => s.season_number > 0);
  const specials = seasons.find((s) => s.season_number === 0);

  return (
    <>
      {trailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setTrailerOpen(false)} />
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-8 overflow-x-auto scrollbar-none">
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
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "Overview" && (
        <div className="space-y-10 pb-16 min-w-0">
          <div className="grid lg:grid-cols-3 gap-8 min-w-0">
            {/* min-w-0 on grid items is load-bearing on mobile — CSS
               Grid items default to min-width: auto which resolves to
               min-content, so a wide nested element (the season-poster
               strip with overflow-x-auto, for example) was blowing the
               column out past the viewport. */}
            <div className="lg:col-span-2 space-y-6 min-w-0">
              <p className="text-[var(--foreground-muted)] leading-relaxed break-words">{show.overview}</p>

              <div className="flex flex-wrap items-center gap-3">
                {trailerKey && (
                  <button
                    onClick={() => setTrailerOpen(true)}
                    className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
                  >
                    <Play className="w-4 h-4 fill-white" /> Watch Trailer
                  </button>
                )}
              </div>

              {/* Season summary */}
              {mainSeasons.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-white">
                      {mainSeasons.length} Season{mainSeasons.length !== 1 ? "s" : ""}
                    </h3>
                    <button
                      onClick={() => setActiveTab("Seasons")}
                      className="text-sm text-[var(--ratist-red)] hover:underline flex items-center gap-1"
                    >
                      View all <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                    {mainSeasons.slice(0, 8).map((s) => (
                      <button
                        key={s.season_number}
                        onClick={() => setActiveTab("Seasons")}
                        className="shrink-0 w-20 group"
                      >
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1">
                          {s.poster_path ? (
                            <Image
                              src={posterUrl(s.poster_path, "w92")}
                              alt={s.name}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">S{s.season_number}</div>
                          )}
                        </div>
                        <p className="text-[10px] text-white line-clamp-2" title={s.name}>{s.name}</p>
                        <p className="text-[9px] text-[var(--foreground-muted)]">{s.episode_count} ep{s.episode_count !== 1 ? "s" : ""}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: facts + watch providers */}
            <div className="space-y-6 min-w-0">
              <div className="space-y-3">
                <FactRow label="Status" value={show.status} />
                <FactRow label="First Aired" value={show.first_air_date} />
                {show.last_air_date && show.status === "Ended" && (
                  <FactRow label="Last Aired" value={show.last_air_date} />
                )}
                {creators.length > 0 && (
                  <FactRow label="Created by" value={creators.map((c) => c.name).join(", ")} />
                )}
                {executiveProducers.length > 0 && (
                  <FactRow label="Exec. Producer" value={executiveProducers.slice(0, 3).map((p) => p.name).join(", ")} />
                )}
                {composers.length > 0 && (
                  <FactRow label="Music" value={composers[0].name} />
                )}
                {show.networks && show.networks.length > 0 && (
                  <FactRow label="Network" value={show.networks.map((n) => n.name).join(", ")} />
                )}
                {show.production_companies && show.production_companies.length > 0 && (
                  <FactRow
                    label="Studio"
                    value={show.production_companies.slice(0, 3).map((c) => c.name).join(", ")}
                  />
                )}
                {show.number_of_seasons && (
                  <FactRow label="Seasons" value={String(show.number_of_seasons)} />
                )}
                {show.number_of_episodes && (
                  <FactRow label="Episodes" value={String(show.number_of_episodes)} />
                )}
              </div>

              <WatchProviders
                streaming={streaming ?? undefined}
                rent={rent ?? undefined}
                contentTitle={show.name}
                contentType="tv"
                tmdbId={show.id}
              />
            </div>
          </div>

          {/* Review preview */}
          {reviews && reviews.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">
                  Community Reviews
                  <span className="ml-2 text-sm font-normal text-[var(--foreground-muted)]">({reviews.length})</span>
                </h3>
                <button onClick={() => setActiveTab("Reviews")} className="text-sm text-[var(--ratist-red)] hover:underline flex items-center gap-1">
                  See all reviews <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <ReviewDigest mediaType="tv" tmdbId={show.id} />
              {reviews.slice(0, 3).map((r) => (
                <div key={r.id}>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 mb-1 inline-block">
                    {r.ratingScope === "series" ? "Series" : `Season ${r.seasonNumber}`}
                  </span>
                  <ReviewCard
                    review={{
                      id: r.id, reviewText: r.reviewText, ratistRating: r.ratistRating,
                      overallRating: r.overallRating, storyScore: null, styleScore: null,
                      emotiveScore: null, actingScore: null, entertainScore: null,
                      reviewType: r.reviewType, fieldComments: null, categoryComments: null,
                      hasSpoilers: r.hasSpoilers, commentsDisabled: r.commentsDisabled,
                      createdAt: r.createdAt, commentCount: r.commentCount, likeCount: r.likeCount,
                      likedByMe: false, user: r.user,
                    }}
                    showTmdbId={tmdbId ?? show.id}
                    compact
                  />
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">More Like This</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {recommendations.slice(0, 10).map((s) => (
                  <ShowCard key={s.id} show={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── REVIEWS TAB ── */}
      {activeTab === "Reviews" && (() => {
        const showId = tmdbId ?? show.id;
        const seasonNumbers = [...new Set(reviews.filter((r) => r.ratingScope === "season").map((r) => r.seasonNumber))].sort((a, b) => a - b);
        const hasSeries = reviews.some((r) => r.ratingScope === "series");
        const filtered = reviews.filter((r) => {
          if (reviewFilter === "all") return true;
          if (reviewFilter === "series") return r.ratingScope === "series";
          return r.ratingScope === "season" && r.seasonNumber === reviewFilter;
        });
        const displayed = filtered.slice(0, 10);

        return (
          <div className="space-y-6 pb-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">
                Community Reviews
                {reviews.length > 0 && <span className="ml-2 text-sm font-normal text-[var(--foreground-muted)]">({reviews.length})</span>}
              </h2>
              <div className="flex items-center gap-2">
                <Link href={`/shows/${showId}/rate`} className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors">
                  Rate &amp; Review
                </Link>
                <Link href={`/shows/${showId}/reviews`} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                  All reviews &rarr;
                </Link>
              </div>
            </div>

            <RatingDistribution tmdbId={show.id} mediaType="tv" />
            <ReviewDigest mediaType="tv" tmdbId={show.id} />

            {/* Scope filter */}
            <div className="flex flex-wrap gap-2">
              {(["all", ...(hasSeries ? ["series"] : []), ...seasonNumbers] as ("all" | "series" | number)[]).map((f) => (
                <button
                  key={String(f)}
                  onClick={() => setReviewFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    reviewFilter === f
                      ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                      : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
                  }`}
                >
                  {f === "all" ? "All" : f === "series" ? "Series" : `Season ${f}`}
                </button>
              ))}
            </div>

            {displayed.length > 0 ? (
              <div className="space-y-4">
                {displayed.map((review) => (
                  <div key={review.id}>
                    <div className="mb-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        review.ratingScope === "series"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {review.ratingScope === "series" ? "Series" : `Season ${review.seasonNumber}`}
                      </span>
                    </div>
                    <ReviewCard
                      review={{
                        ...review,
                        storyScore: null, styleScore: null, emotiveScore: null,
                        actingScore: null, entertainScore: null,
                        fieldComments: null, categoryComments: null, likedByMe: false,
                      }}
                      showTmdbId={showId}
                    />
                  </div>
                ))}
                {filtered.length > 10 && (
                  <div className="text-center pt-2">
                    <Link href={`/shows/${showId}/reviews`} className="text-sm text-[var(--ratist-red)] hover:underline">
                      See all {filtered.length} reviews &rarr;
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-[var(--foreground-muted)] mb-4">No reviews yet. Be the first!</p>
                <Link href={`/shows/${showId}/rate`} className="text-sm text-[var(--ratist-red)] hover:underline">
                  Write a review &rarr;
                </Link>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── AWARDS TAB ── */}
      {activeTab === "Awards" && (
        <AwardsTab awards={awards} entityType="tvshow" tmdbId={tmdbId} />
      )}

      {/* ── SEASONS TAB ── */}
      {activeTab === "Seasons" && (
        <div className="space-y-4 pb-16">
          {mainSeasons.map((s) => (
            <SeasonCard
              key={s.season_number}
              season={s}
              showTmdbId={show.id}
              seenEpisodes={seenEpisodes}
              onToggleEpisode={toggleEpisode}
              onToggleSeason={toggleSeason}
              onUpdateEpisodeDate={updateEpisodeDate}
              onUpdateSeasonDate={updateSeasonDate}
              isLoggedIn={isLoggedIn}
              aggregate={seasonAggregates.find((a) => a.ratingScope === "season" && a.seasonNumber === s.season_number)}
              isAiring={
                show.next_episode_to_air?.season_number === s.season_number
                && show.last_episode_to_air?.season_number === s.season_number
                && (s.episode_count ?? 0) > 1
              }
            />
          ))}
          {specials && specials.episode_count > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[var(--foreground-muted)] mt-6 mb-2">Specials</h3>
              <SeasonCard
                season={specials}
                showTmdbId={show.id}
                seenEpisodes={seenEpisodes}
                onToggleEpisode={toggleEpisode}
                onToggleSeason={toggleSeason}
                onUpdateEpisodeDate={updateEpisodeDate}
                onUpdateSeasonDate={updateSeasonDate}
                isLoggedIn={isLoggedIn}
                aggregate={seasonAggregates.find((a) => a.ratingScope === "season" && a.seasonNumber === 0)}
              />
            </>
          )}
        </div>
      )}

      {/* ── CAST & CREW TAB ── */}
      {activeTab === "Cast & Crew" && (
        <div className="space-y-10 pb-16">
          {/* Creators / key crew */}
          {(creators.length > 0 || executiveProducers.length > 0) && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Creators & Showrunners</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {creators.map((member) => (
                  <Link key={member.id} href={`/celebrities/${member.id}`} className="group flex flex-col items-center text-center gap-1.5">
                    <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                      {member.profile_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                          alt={member.name}
                          fill
                          sizes="100px"
                          className="object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-2xl">&#x1f464;</div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-2" title={member.name}>{member.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">Creator</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Full cast */}
          {cast.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Cast</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {displayedCast.map((member) => (
                  <Link key={member.id} href={`/celebrities/${member.id}`} className="group flex flex-col items-center text-center gap-1.5">
                    <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                      {member.profile_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                          alt={member.name}
                          fill
                          sizes="(max-width: 640px) 33vw, 12vw"
                          className="object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-2xl">&#x1f464;</div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-2" title={member.name}>{member.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)] line-clamp-2" title={member.roles?.[0]?.character}>{member.roles?.[0]?.character}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">{member.total_episode_count} ep{member.total_episode_count !== 1 ? "s" : ""}</p>
                  </Link>
                ))}
              </div>
              {cast.length > 18 && !showAllCast && (
                <button
                  onClick={() => setShowAllCast(true)}
                  className="mt-4 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  Show all {cast.length} cast members
                </button>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── MEDIA TAB ── */}
      {activeTab === "Media" && (
        <div className="space-y-8 pb-16">
          {trailerKey && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Trailer</h2>
              <button
                onClick={() => setTrailerOpen(true)}
                className="relative aspect-video w-full max-w-2xl rounded-xl overflow-hidden group cursor-pointer"
              >
                <Image
                  src={`https://img.youtube.com/vi/${trailerKey}/maxresdefault.jpg`}
                  alt="Trailer thumbnail"
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[var(--ratist-red)] flex items-center justify-center">
                    <Play className="w-7 h-7 fill-white text-white ml-1" />
                  </div>
                </div>
              </button>
            </section>
          )}

          {/* Soundtrack */}
          <section>
            <h2 className="text-base font-semibold text-white mb-3">Official Soundtrack</h2>
            <Soundtrack tmdbId={show.id} title={show.name} mediaType="tv" />
          </section>

          {images.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-base font-semibold text-white">Images &amp; Stills</h2>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {showAllImages ? images.length : Math.min(12, images.length)} of {images.length}
                </span>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">Click any image to view full size</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(showAllImages ? images : images.slice(0, 12)).map((img, i) => (
                  <a
                    key={i}
                    href={`https://image.tmdb.org/t/p/original${img.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors block"
                  >
                    <Image
                      src={`https://image.tmdb.org/t/p/w780${img.file_path}`}
                      alt={`Still ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </a>
                ))}
              </div>
              {images.length > 12 && (
                <button
                  onClick={() => setShowAllImages((v) => !v)}
                  className="mt-4 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  {showAllImages ? "Show fewer" : `Show all ${images.length} images`}
                </button>
              )}
            </section>
          )}

          {images.length === 0 && !trailerKey && (
            <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">No media available for this title.</p>
          )}
        </div>
      )}

      {/* ── DISCUSSIONS TAB ── */}
      {activeTab === "Discussions" && (
        <div className="pb-16">
          {discussions.length > 0 ? (
            (() => {
              // Editorial first (articles + blog variants), forum
              // threads below. See MovieDetailTabs for the same shape.
              const EDITORIAL_THREAD_TYPES = new Set(["news", "blog", "two-thumbs", "movie-map"]);
              const editorial = discussions.filter((d) => EDITORIAL_THREAD_TYPES.has(d.threadType));
              const forum = discussions.filter((d) => !EDITORIAL_THREAD_TYPES.has(d.threadType));
              const forumTheories = forum.filter((d) => d.threadType === "theory");
              const forumOther = forum.filter((d) => d.threadType !== "theory");
              return (
                <div className="space-y-6">
                  {editorial.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Articles &amp; posts</p>
                      {editorial.map((d) => (
                        <DiscussionRow key={d.id} d={d} />
                      ))}
                    </div>
                  )}
                  {forum.length > 0 && (
                    <div className="space-y-3">
                      {editorial.length > 0 && (
                        <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Forum threads</p>
                      )}
                      {forumTheories.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-purple-400 bg-purple-500/20">Fan Theories</span>
                            <span className="text-[10px] text-yellow-400">May contain spoilers</span>
                          </div>
                          {forumTheories.map((d) => (
                            <DiscussionRow key={d.id} d={d} />
                          ))}
                          {forumOther.length > 0 && <hr className="border-[var(--border)] my-3" />}
                        </>
                      )}
                      {forumOther.map((d) => (
                        <DiscussionRow key={d.id} d={d} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="text-center py-10">
              <p className="text-[var(--foreground-muted)] mb-3">No discussions yet for this show.</p>
              <Link
                href={`/forum/new?mediaType=tv&tmdbId=${tmdbId ?? show.id}&title=${encodeURIComponent(show.name)}&posterPath=${encodeURIComponent(show.poster_path ?? "")}`}
                className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
              >
                Start a Discussion
              </Link>
            </div>
          )}
          {discussions.length > 0 && (
            <div className="text-center mt-4">
              <Link
                href={`/forum/new?mediaType=tv&tmdbId=${tmdbId ?? show.id}&title=${encodeURIComponent(show.name)}&posterPath=${encodeURIComponent(show.poster_path ?? "")}`}
                className="text-sm text-[var(--ratist-red)] hover:underline"
              >
                + Start a new discussion
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── PARENTS' GUIDE TAB ── */}
      {activeTab === "Parents' Guide" && (
        <div className="pb-16">
          <ParentsGuide tmdbId={show.id} title={show.name} />
        </div>
      )}
    </>
  );
}
