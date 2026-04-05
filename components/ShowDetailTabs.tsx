"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, ArrowRight, ChevronDown, ChevronUp, Check, Eye, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
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
import ParentsGuide from "./ParentsGuide";
import Soundtrack from "./Soundtrack";

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
}

const TABS = ["Overview", "Seasons", "Cast & Crew", "Media", "Parents' Guide"] as const;
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
  isLoggedIn,
}: {
  season: TMDBSeason;
  showTmdbId: number;
  seenEpisodes: Set<string>;
  onToggleEpisode: (seasonNumber: number, episodeNumber: number) => void;
  onToggleSeason: (seasonNumber: number, episodeCount: number, episodes: TMDBEpisode[]) => void;
  isLoggedIn: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<TMDBEpisode[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Count seen episodes in this season — use seenEpisodes set directly so it works before expanding
  const seenCount = episodes
    ? episodes.filter((ep) => seenEpisodes.has(`${season.season_number}-${ep.episode_number}`)).length
    : Array.from(seenEpisodes).filter((key) => key.startsWith(`${season.season_number}-`)).length;
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
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
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
            <p className="text-sm font-semibold text-white">{season.name}</p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {season.episode_count} episode{season.episode_count !== 1 ? "s" : ""}
              {season.air_date ? ` · ${season.air_date.slice(0, 4)}` : ""}
            </p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />}
        </button>
        {isLoggedIn && (
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
        )}
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
                        <p className="text-[11px] text-[var(--foreground-muted)] mt-1 line-clamp-2">{ep.overview}</p>
                      )}
                    </div>
                    {isLoggedIn && (
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
                    )}
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
}: Props) {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [showAllCast, setShowAllCast] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [seenEpisodes, setSeenEpisodes] = useState<Set<string>>(new Set());

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
          const set = new Set<string>();
          for (const ep of data.episodes) {
            set.add(`${ep.seasonNumber}-${ep.episodeNumber}`);
          }
          setSeenEpisodes(set);
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
        const next = new Set(prev);
        if (removing) next.delete(key);
        else next.add(key);
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

  const toggleSeason = useCallback(
    async (seasonNumber: number, episodeCount: number, episodes: TMDBEpisode[]) => {
      if (!user) return;
      const allSeen = episodes.every((ep) =>
        seenEpisodes.has(`${seasonNumber}-${ep.episode_number}`)
      );
      const action = allSeen ? "remove" : "add";
      setSeenEpisodes((prev) => {
        const next = new Set(prev);
        for (const ep of episodes) {
          const key = `${seasonNumber}-${ep.episode_number}`;
          if (allSeen) next.delete(key);
          else next.add(key);
        }
        return next;
      });
      const token = await user.getIdToken();
      fetch(`/api/shows/${show.id}/episodes/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "season",
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
        <div className="space-y-10 pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <p className="text-[var(--foreground-muted)] leading-relaxed">{show.overview}</p>

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
                        <p className="text-[10px] text-white line-clamp-1">{s.name}</p>
                        <p className="text-[9px] text-[var(--foreground-muted)]">{s.episode_count} ep{s.episode_count !== 1 ? "s" : ""}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: facts + watch providers */}
            <div className="space-y-6">
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
              />
            </div>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">More Like This</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {recommendations.slice(0, 12).map((s) => (
                  <Link key={s.id} href={`/shows/${s.id}`} className="group flex flex-col">
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                      <Image
                        src={posterUrl(s.poster_path, "w185")}
                        alt={s.name}
                        fill
                        sizes="(max-width: 640px) 33vw, 15vw"
                        className="object-cover"
                      />
                      <div className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                        <Tv className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-bold leading-none">TV</span>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-white line-clamp-1">{s.name}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">{s.first_air_date?.slice(0, 4) ?? "—"}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
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
              isLoggedIn={isLoggedIn}
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
                isLoggedIn={isLoggedIn}
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
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{member.name}</p>
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
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{member.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{member.roles?.[0]?.character}</p>
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

      {/* ── PARENTS' GUIDE TAB ── */}
      {activeTab === "Parents' Guide" && (
        <div className="pb-16">
          <ParentsGuide tmdbId={show.id} title={show.name} />
        </div>
      )}
    </>
  );
}
