"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Users, BookOpen, Lock, AlertCircle, ChevronDown, Heart, Briefcase, Swords, Handshake, GraduationCap, Link2, Sparkles, Network } from "lucide-react";
import SuggestEditButton from "./SuggestEditButton";
import CommunitySuggestions from "./CommunitySuggestions";
import RelationshipMap from "./RelationshipMap";
import CompanionNotAvailable from "./CompanionNotAvailable";
import AdUnit from "@/components/AdUnit";
import { track } from "@/lib/analytics";

const COMPANION_AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMPANION ?? "";

interface VisibleAfter {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

interface WatchPosition {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

interface Fact { id: string; fact: string; factType: string; visibleAfter: VisibleAfter }
interface ActorEntry {
  actorName: string;
  actorTmdbId: number | null;
  note: string | null;
  visibleAfter: VisibleAfter;
  imageUrl: string | null;
}
interface NameAlias { name: string; visibleAfter: VisibleAfter }
interface Character {
  id: string; name: string; actorName: string | null; actorTmdbId: number | null;
  baseDescription: string; group: string | null; imageUrl: string | null;
  seasonNumber: number | null;
  visibleAfter: VisibleAfter; facts: Fact[];
  actors: ActorEntry[];
  nameAliases: NameAlias[];
}
interface Relationship {
  id: string; relationshipType: string; label: string; directed: boolean;
  fromCharacterId: string; toCharacterId: string; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}
interface TimelineEvent {
  id: string; description: string; importance: number;
  characterIds: string[]; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}
interface GlossaryTerm {
  id: string; term: string; definition: string;
  category: string | null; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}

export interface WatchCompanionData {
  id: string;
  tmdbId: number; // needed for the inline generate-ungenerated-season flow
  title: string;
  mediaType: "movie" | "tv";
  runtimeSeconds: number | null;
  seasonsGenerated: number[];
  characters: Character[];
  relationships: Relationship[];
  timeline: TimelineEvent[];
  glossary: GlossaryTerm[];
  seasonEpisodeCounts?: Record<number, number>;
  defaultEpisodeRuntimeSeconds?: number;
}

function isVisible(visibleAfter: VisibleAfter, position: WatchPosition, mediaType: "movie" | "tv"): boolean {
  if (mediaType === "movie") {
    return (position.seconds ?? 0) >= (visibleAfter.seconds ?? 0);
  }
  const thSeason = visibleAfter.season ?? 1;
  const thEpisode = visibleAfter.episode ?? 1;
  const thSeconds = visibleAfter.seconds ?? 0;
  const curSeason = position.season ?? 1;
  const curEpisode = position.episode ?? 1;
  const curSeconds = position.seconds ?? Number.MAX_SAFE_INTEGER;
  if (curSeason > thSeason) return true;
  if (curSeason < thSeason) return false;
  if (curEpisode > thEpisode) return true;
  if (curEpisode < thEpisode) return false;
  return curSeconds >= thSeconds;
}

function formatMovieTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const GROUP_COLORS = ["#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5", "#dd6b20", "#319795", "#d53f8c"];

const RELATIONSHIP_ICONS: Record<string, typeof Heart> = {
  romantic: Heart,
  business: Briefcase,
  rivalry: Swords,
  alliance: Handshake,
  mentor: GraduationCap,
  family: Users,
  other: Link2,
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  romantic: "text-pink-400 border-pink-500/40",
  business: "text-blue-400 border-blue-500/40",
  rivalry: "text-red-400 border-red-500/40",
  alliance: "text-green-400 border-green-500/40",
  mentor: "text-purple-400 border-purple-500/40",
  family: "text-amber-400 border-amber-500/40",
  other: "text-[var(--foreground-muted)] border-[var(--border)]",
};

// Build a linear episode index so TV shows get a real slider
interface EpisodeSlot { season: number; episode: number }

function buildEpisodeSlots(seasonsGenerated: number[], seasonEpisodeCounts: Record<number, number>): EpisodeSlot[] {
  const slots: EpisodeSlot[] = [];
  for (const s of seasonsGenerated) {
    const count = seasonEpisodeCounts[s] ?? 12;
    for (let e = 1; e <= count; e++) slots.push({ season: s, episode: e });
  }
  return slots;
}

// Small toggle pill used for the glossary category quick-filter row.
function FilterPill({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border transition-colors ${
        active
          ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
          : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/50"
      }`}
    >
      {children}
    </button>
  );
}

// Collapsible section wrapper with optional inline suggest button
function Section({
  title, children, suggestButton,
}: {
  // Icon/count/defaultOpen kept as accepted props for call-site continuity
  // but no longer rendered — tabs make section-level collapse redundant.
  icon?: typeof Users; title: string; count?: number; defaultOpen?: boolean;
  children: React.ReactNode; suggestButton?: React.ReactNode;
}) {
  return (
    <section>
      <div className="sr-only">{title}</div>
      <div className="space-y-3">
        {children}
        {suggestButton && <div className="flex justify-end pt-1">{suggestButton}</div>}
      </div>
    </section>
  );
}

export default function WatchCompanionView({ data }: { data: WatchCompanionData }) {
  const { mediaType, runtimeSeconds, seasonsGenerated } = data;
  const generatedSet = useMemo(() => new Set(seasonsGenerated), [seasonsGenerated]);
  // All seasons TMDB knows about for this show — the dropdown lists all of
  // them so the user can pick an ungenerated season and trigger gen from
  // inside the viewer. Falls back to just generated seasons for movies or
  // when seasonEpisodeCounts wasn't passed.
  const sortedSeasons = useMemo(() => {
    const allFromTmdb = Object.keys(data.seasonEpisodeCounts ?? {}).map(Number).filter((n) => n > 0);
    const combined = new Set<number>([...allFromTmdb, ...seasonsGenerated]);
    return Array.from(combined).sort((a, b) => a - b);
  }, [seasonsGenerated, data.seasonEpisodeCounts]);
  const defaultSeason = seasonsGenerated[0] ?? sortedSeasons[0] ?? 1;

  // Persist slider position + selected season per-companion in localStorage so
  // tapping an actor and coming back doesn't snap the viewer to the start of
  // S1E1.
  const storageKey = `watchcompanion:${data.id}`;
  const [seconds, setSeconds] = useState<number>(0);
  const [slotIndex, setSlotIndex] = useState<number>(0);
  const [episodeSeconds, setEpisodeSeconds] = useState<number>(0);
  const [selectedSeason, setSelectedSeason] = useState<number>(defaultSeason);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<"cast" | "map" | "timeline" | "glossary">("cast");
  const [glossaryCategoryFilter, setGlossaryCategoryFilter] = useState<string | "all">("all");

  // Episode slots for the CURRENTLY SELECTED season only. The season picker is
  // the "which season am I watching?" control; the slider scrubs within it.
  const episodeSlots = useMemo(
    () => mediaType === "tv" ? buildEpisodeSlots([selectedSeason], data.seasonEpisodeCounts ?? {}) : [],
    [mediaType, selectedSeason, data.seasonEpisodeCounts],
  );

  // Restore on mount (client only; avoids hydration mismatch by deferring)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { seconds?: number; slotIndex?: number; episodeSeconds?: number; selectedSeason?: number };
        if (typeof saved.seconds === "number") setSeconds(saved.seconds);
        if (typeof saved.slotIndex === "number") setSlotIndex(saved.slotIndex);
        if (typeof saved.episodeSeconds === "number") setEpisodeSeconds(saved.episodeSeconds);
        if (typeof saved.selectedSeason === "number" && sortedSeasons.includes(saved.selectedSeason)) {
          setSelectedSeason(saved.selectedSeason);
        }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, [storageKey, sortedSeasons]);

  // Persist on change (only after initial hydrate so we don't overwrite with defaults)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ seconds, slotIndex, episodeSeconds, selectedSeason }));
    } catch { /* storage full or disabled — ignore */ }
  }, [hydrated, storageKey, seconds, slotIndex, episodeSeconds, selectedSeason]);

  // Fire the companion_view event once per mount. Put this after hydration
  // so session storage is respected for season pick.
  useEffect(() => {
    track("companion_view", {
      companion_id: data.id,
      media_type: mediaType,
      title: data.title,
    });
    // run-once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentSlot = episodeSlots[slotIndex] ?? { season: selectedSeason, episode: 1 };

  const position: WatchPosition = useMemo(
    () => mediaType === "movie"
      ? { seconds }
      : { season: currentSlot.season, episode: currentSlot.episode, seconds: episodeSeconds },
    [mediaType, seconds, currentSlot, episodeSeconds],
  );

  // Filter all content down to the selected season first, then apply the
  // spoiler-slider visibility check. For movies, seasonNumber is null and
  // the filter is a no-op.
  const seasonCharacters = useMemo(
    () => mediaType === "movie"
      ? data.characters
      : data.characters.filter((c) => c.seasonNumber === selectedSeason),
    [data.characters, mediaType, selectedSeason],
  );
  const seasonRelationships = useMemo(
    () => mediaType === "movie"
      ? data.relationships
      : data.relationships.filter((r) => r.seasonNumber === selectedSeason),
    [data.relationships, mediaType, selectedSeason],
  );
  const seasonTimeline = useMemo(
    () => mediaType === "movie"
      ? data.timeline
      : data.timeline.filter((t) => t.seasonNumber === selectedSeason),
    [data.timeline, mediaType, selectedSeason],
  );
  const seasonGlossary = useMemo(
    () => mediaType === "movie"
      ? data.glossary
      : data.glossary.filter((g) => g.seasonNumber === selectedSeason),
    [data.glossary, mediaType, selectedSeason],
  );

  const groupColors = useMemo(() => {
    const groups = Array.from(new Set(seasonCharacters.map((c) => c.group).filter((g): g is string => !!g)));
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g, GROUP_COLORS[i % GROUP_COLORS.length]));
    return map;
  }, [seasonCharacters]);

  const visibleCharacters = useMemo(
    () => seasonCharacters.filter((c) => isVisible(c.visibleAfter, position, mediaType)),
    [seasonCharacters, position, mediaType],
  );
  const visibleCharIds = useMemo(() => new Set(visibleCharacters.map((c) => c.id)), [visibleCharacters]);
  const visibleRelationships = useMemo(
    () => seasonRelationships.filter((r) =>
      isVisible(r.visibleAfter, position, mediaType) &&
      visibleCharIds.has(r.fromCharacterId) && visibleCharIds.has(r.toCharacterId)
    ),
    [seasonRelationships, position, mediaType, visibleCharIds],
  );
  const visibleTimeline = useMemo(
    () => seasonTimeline.filter((t) => isVisible(t.visibleAfter, position, mediaType))
      .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType)),
    [seasonTimeline, position, mediaType],
  );
  const visibleGlossary = useMemo(
    () => seasonGlossary.filter((g) => isVisible(g.visibleAfter, position, mediaType)),
    [seasonGlossary, position, mediaType],
  );

  // Relationships embedded per-character (both ends of each relationship)
  const relationshipsByCharacter = useMemo(() => {
    const map = new Map<string, Array<{ rel: Relationship; direction: "out" | "in" }>>();
    for (const r of visibleRelationships) {
      const outList = map.get(r.fromCharacterId) ?? [];
      outList.push({ rel: r, direction: "out" });
      map.set(r.fromCharacterId, outList);
      const inList = map.get(r.toCharacterId) ?? [];
      inList.push({ rel: r, direction: r.directed ? "in" : "out" });
      map.set(r.toCharacterId, inList);
    }
    return map;
  }, [visibleRelationships]);

  const nameOf = (id: string) => data.characters.find((c) => c.id === id)?.name ?? "(unknown)";

  const hiddenCount =
    (seasonCharacters.length - visibleCharacters.length) +
    (seasonRelationships.length - visibleRelationships.length) +
    (seasonTimeline.length - visibleTimeline.length) +
    (seasonGlossary.length - visibleGlossary.length);

  // If the user selects a season TMDB knows about but we haven't generated
  // yet, flip the body to the generate/request flow instead of showing empty
  // tabs. Movies don't have seasons so the check is TV-only.
  const seasonIsGenerated = mediaType === "movie" || generatedSet.has(selectedSeason);

  // Thin-content detection for the "this companion is lightweight" banner.
  // Thresholds match the Cine-Q-style floor: fewer than 5 characters or
  // fewer than 3 timeline events = we couldn't assemble much, invite
  // community refinement. Evaluated against the currently selected season
  // so only the thin season flags, not a full show.
  const isThinContent = seasonIsGenerated && (seasonCharacters.length < 5 || seasonTimeline.length < 3);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Disclaimer — small, non-intrusive */}
      <p className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1.5 leading-relaxed">
        <Sparkles className="w-3 h-3 shrink-0 text-[var(--ratist-red)]/70" />
        AI-drafted and community-refined — accuracy improves as users contribute corrections.
      </p>

      {/* Thin-content banner — fires when the currently-viewed season has
         fewer than 5 characters or fewer than 3 timeline beats. Indicates
         the AI didn't have enough source info to assemble a full companion
         and invites community fill-in. */}
      {isThinContent && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold text-white">This companion is a bit thin.</span>{" "}
            We had limited background info for this title — you can help round it out using the suggestion buttons on each section below.
          </span>
        </div>
      )}

      {/* Spoiler slider hint — lives ABOVE the sticky cluster on purpose so it
         shows on first load but scrolls away, keeping the sticky header
         compact on mobile. */}
      <p className="text-[11px] text-[var(--foreground-muted)] leading-relaxed flex items-start gap-1.5 -mt-3">
        <Lock className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          <span className="font-semibold text-white">Slide as you watch.</span>{" "}
          Characters, relationships, timeline beats and glossary terms unlock as you move the slider forward so nothing gets spoiled.
        </span>
      </p>

      {/* Season picker — non-sticky, lives above the sticky cluster so it
         scrolls away on mobile rather than eating vertical space. */}
      {mediaType === "tv" && sortedSeasons.length > 1 && (
        <div className="flex items-center gap-2 -mt-3">
          <label htmlFor="season-picker" className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
            Season
          </label>
          <select
            id="season-picker"
            value={selectedSeason}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              setSelectedSeason(next);
              // Reset the within-season slider when swapping seasons so you
              // don't land on ep 8 of S2 just because that's where you were
              // in S1.
              setSlotIndex(0);
              setEpisodeSeconds(0);
              track("companion_season_change", { companion_id: data.id, season: next });
            }}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            aria-label="Which season are you watching?"
          >
            {sortedSeasons.map((n) => (
              <option key={n} value={n}>
                Season {n}{generatedSet.has(n) ? "" : " — not generated"}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sticky cluster: slider + tabs ride together just below the site
         navbar (72px tall). Both panes stay visible when scrolling. */}
      <div className="sticky top-[72px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2 pt-2 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border)]/50">
      {seasonIsGenerated && (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-4 shadow-lg">
        {mediaType === "movie" && runtimeSeconds ? (
          <>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">Position</label>
              <span className="text-sm text-white font-medium tabular-nums">
                {formatMovieTime(seconds)} <span className="text-[var(--foreground-muted)]">of {formatMovieTime(runtimeSeconds)}</span>
                {hiddenCount > 0 && <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-[var(--foreground-muted)]"><Lock className="w-3 h-3" /> {hiddenCount}</span>}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={runtimeSeconds}
              step={30}
              value={seconds}
              onChange={(e) => setSeconds(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--ratist-red)]"
              aria-label="Movie position"
            />
          </>
        ) : mediaType === "tv" && episodeSlots.length > 0 ? (
          <>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
                Episode <span className="text-white font-semibold normal-case tracking-normal">S{currentSlot.season}·E{currentSlot.episode}</span>
              </label>
              {hiddenCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--foreground-muted)]"><Lock className="w-3 h-3" /> {hiddenCount} hidden</span>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={episodeSlots.length - 1}
              step={1}
              value={slotIndex}
              onChange={(e) => { setSlotIndex(parseInt(e.target.value, 10)); setEpisodeSeconds(0); }}
              className="w-full accent-[var(--ratist-red)]"
              aria-label="Episode position"
            />
            <div className="flex items-baseline justify-between mt-2 mb-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
                Position in episode{" "}
                <span className="text-white font-semibold normal-case tracking-normal tabular-nums">
                  {formatMovieTime(episodeSeconds)}
                  {data.defaultEpisodeRuntimeSeconds && <span className="text-[var(--foreground-muted)] font-normal"> / {formatMovieTime(data.defaultEpisodeRuntimeSeconds)}</span>}
                </span>
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={data.defaultEpisodeRuntimeSeconds ?? 3600}
              step={60}
              value={episodeSeconds}
              onChange={(e) => setEpisodeSeconds(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--ratist-red)]"
              aria-label="Position within episode"
            />
          </>
        ) : null}
      </div>
      )}

        {/* Tabs — part of the sticky cluster so they stay visible too.
           Hide entirely on ungenerated seasons (the body below renders the
           generate/request panel instead). */}
        {seasonIsGenerated && visibleCharacters.length > 0 && (
          <nav className="flex gap-1 border-b border-[var(--border)] overflow-x-auto mt-2 -mb-2">
            {([
              { key: "cast", label: "Cast", icon: Users, count: visibleCharacters.length },
              { key: "map", label: "Map", icon: Network, count: visibleRelationships.length },
              { key: "glossary", label: "Glossary", icon: BookOpen, count: visibleGlossary.length },
              { key: "timeline", label: "Timeline", icon: Clock, count: visibleTimeline.length },
            ] as const).map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => {
                  setActiveTab(key);
                  track("companion_tab_switch", { companion_id: data.id, tab: key });
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-[var(--ratist-red)] text-white"
                    : "border-transparent text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {count > 0 && <span className="text-xs text-[var(--foreground-muted)]">({count})</span>}
              </button>
            ))}
          </nav>
        )}
      </div>

      {!seasonIsGenerated && (
        <CompanionNotAvailable
          tmdbId={data.tmdbId}
          mediaType="tv"
          title={data.title}
          season={selectedSeason}
          availableSeasons={sortedSeasons}
        />
      )}

      {seasonIsGenerated && visibleCharacters.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Move the slider forward to see characters and events as they appear in the story.</span>
        </div>
      )}

      {/* Cast with embedded relationships */}
      {seasonIsGenerated && activeTab === "cast" && visibleCharacters.length > 0 && (
        <Section
          icon={Users}
          title="Cast"
          count={visibleCharacters.length}
          suggestButton={<SuggestEditButton companionId={data.id} defaultTargetType="character" label="Suggest a character edit" compact />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleCharacters.map((c, idx) => {
              const color = c.group ? groupColors.get(c.group) ?? GROUP_COLORS[0] : GROUP_COLORS[0];
              const visibleFacts = c.facts.filter((f) => isVisible(f.visibleAfter, position, mediaType));
              const connections = relationshipsByCharacter.get(c.id) ?? [];

              // Resolve which actor is "current" at the user's slider
              // position. If the side table has entries, pick the one with
              // the latest visibleAfter that's still ≤ position. Otherwise
              // fall back to the primary actor on the character row (handles
              // pre-migration data cleanly).
              const unlockedActors = (c.actors ?? [])
                .filter((a) => isVisible(a.visibleAfter, position, mediaType))
                .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
              const currentActor = unlockedActors[unlockedActors.length - 1] ?? (c.actorName ? {
                actorName: c.actorName,
                actorTmdbId: c.actorTmdbId,
                note: null as string | null,
                visibleAfter: c.visibleAfter,
                imageUrl: c.imageUrl,
              } : null);
              const pastActors = unlockedActors.slice(0, -1);

              // Resolve the name to display — latest unlocked alias, falling
              // back to the base name. If we've crossed an alias reveal, add
              // a subtle "(previously X)" so rewatch mode still makes sense.
              const unlockedAliases = (c.nameAliases ?? [])
                .filter((n) => isVisible(n.visibleAfter, position, mediaType))
                .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
              const displayName = unlockedAliases[unlockedAliases.length - 1]?.name ?? c.name;
              const hasAliasReveal = unlockedAliases.length > 0;

              return (
                <React.Fragment key={c.id}>
                  {/* Mid-cast ad unit, spans both columns. Only renders at
                     index 6 (i.e. after 6 cards) so short casts don't show
                     it. Paid users skip it automatically via AdUnit. */}
                  {idx === 6 && COMPANION_AD_SLOT && (
                    <div className="sm:col-span-2 my-1">
                      <AdUnit slot={COMPANION_AD_SLOT} format="auto" />
                    </div>
                  )}
                <div
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <div className="flex items-start gap-3">
                    {currentActor?.actorTmdbId ? (
                      <Link href={`/celebrities/${currentActor.actorTmdbId}`} className="shrink-0" aria-label={currentActor.actorName ?? displayName}>
                        {currentActor.imageUrl ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--surface-2)] hover:ring-2 hover:ring-[var(--ratist-red)] transition-all">
                            <Image src={currentActor.imageUrl} alt={displayName} fill sizes="48px" className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-white font-bold hover:ring-2 hover:ring-[var(--ratist-red)] transition-all">
                            {displayName[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                      </Link>
                    ) : currentActor?.imageUrl ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                        <Image src={currentActor.imageUrl} alt={displayName} fill sizes="48px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-white font-bold shrink-0">
                        {displayName[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {displayName}
                        {hasAliasReveal && (
                          <span className="ml-1.5 text-[10px] font-normal text-[var(--foreground-muted)]/80">
                            (previously {c.name})
                          </span>
                        )}
                      </p>
                      {currentActor?.actorName && (
                        <div className="text-[11px] text-[var(--foreground-muted)]">
                          played by{" "}
                          {currentActor.actorTmdbId ? (
                            <Link href={`/celebrities/${currentActor.actorTmdbId}`} className="text-white hover:text-[var(--ratist-red)] transition-colors font-semibold">
                              {currentActor.actorName}
                            </Link>
                          ) : (
                            <span className="text-white font-semibold">{currentActor.actorName}</span>
                          )}
                          {currentActor.note && <span className="text-[var(--foreground-muted)]/70"> ({currentActor.note})</span>}
                        </div>
                      )}
                      {pastActors.length > 0 && (
                        <div className="text-[10px] text-[var(--foreground-muted)]/80 mt-0.5 leading-relaxed">
                          also played by{" "}
                          {pastActors.map((a, i) => (
                            <span key={`${a.actorName}-${i}`}>
                              {a.actorTmdbId ? (
                                <Link href={`/celebrities/${a.actorTmdbId}`} className="hover:text-white transition-colors">
                                  {a.actorName}
                                </Link>
                              ) : (
                                <span>{a.actorName}</span>
                              )}
                              {a.note && <span className="italic"> ({a.note})</span>}
                              {i < pastActors.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.group && <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color }}>{c.group}</p>}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">{c.baseDescription}</p>

                  {connections.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border)]/40 flex flex-wrap gap-1.5">
                      {groupConnectionsForCard(connections, c.id).map((group) => {
                        const RelIcon = RELATIONSHIP_ICONS[group.relationshipType] ?? Link2;
                        const relColor = RELATIONSHIP_COLORS[group.relationshipType] ?? RELATIONSHIP_COLORS.other;
                        const otherNames = group.others.map((id) => nameOf(id));
                        const joined = otherNames.length <= 1
                          ? otherNames[0]
                          : otherNames.length === 2
                            ? otherNames.join(" and ")
                            : otherNames.slice(0, -1).join(", ") + ", and " + otherNames[otherNames.length - 1];
                        const selfName = nameOf(c.id);
                        const fromSelf = group.direction === "out";
                        const selfClass = "text-[var(--foreground-muted)]";
                        const othersClass = "text-white font-semibold";
                        return (
                          <span
                            key={group.key}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-[var(--surface-2)]/50 text-[10px] ${relColor}`}
                          >
                            <RelIcon className="w-3 h-3 shrink-0" />
                            {fromSelf ? (
                              <>
                                <span className={selfClass}>{selfName}</span>
                                <span className="italic">{group.label}</span>
                                <span className={othersClass}>{joined}</span>
                              </>
                            ) : (
                              <>
                                <span className={othersClass}>{joined}</span>
                                <span className="italic">{group.label}</span>
                                <span className={selfClass}>{selfName}</span>
                              </>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Role-tenure ladder: shows how this character's role
                     evolved across the story. Only appears when there are
                     2+ role_change facts unlocked (one change = not a
                     ladder). Rendered before the general facts list since
                     it's usually the most at-a-glance useful info. */}
                  {(() => {
                    const roleChanges = visibleFacts
                      .filter((f) => f.factType === "role_change")
                      .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
                    if (roleChanges.length < 2) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-[var(--border)]/40">
                        <p className="text-[9px] uppercase tracking-wider font-semibold mb-1.5" style={{ color }}>Role history</p>
                        <ol className="space-y-1">
                          {roleChanges.map((f, i) => (
                            <li key={f.id} className="flex items-start gap-2 text-xs">
                              <span className="mt-1 shrink-0" aria-hidden>
                                <span className="block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                {i < roleChanges.length - 1 && (
                                  <span className="block w-px h-3 mx-auto" style={{ backgroundColor: color, opacity: 0.4 }} />
                                )}
                              </span>
                              <span className="text-[var(--foreground-muted)] flex-1 leading-snug">{f.fact}</span>
                              <span className="text-[9px] text-[var(--foreground-muted)]/70 uppercase tracking-wider shrink-0 mt-0.5">
                                {formatVisibleAfter(f.visibleAfter, mediaType)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })()}

                  {/* Facts list — skips role_changes ONLY when the ladder
                     above is rendered (2+ role_changes). With 0–1
                     role_changes the ladder doesn't render and we fall back
                     to showing the single role_change as a normal fact. */}
                  {(() => {
                    const roleCount = visibleFacts.filter((f) => f.factType === "role_change").length;
                    const ladderShown = roleCount >= 2;
                    const displayFacts = ladderShown
                      ? visibleFacts.filter((f) => f.factType !== "role_change")
                      : visibleFacts;
                    if (displayFacts.length === 0) return null;
                    return (
                      <ul className="mt-2 pt-2 border-t border-[var(--border)]/40 space-y-1.5">
                        {displayFacts.map((f) => (
                          /* Inline label — fact text flows after it and
                             wraps UNDER the label on line 2+, saving vertical
                             space vs the old two-column layout. */
                          <li key={f.id} className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                            <span className="text-[9px] uppercase tracking-wider font-semibold mr-1.5" style={{ color }}>
                              {f.factType.replace(/_/g, " ")}
                            </span>
                            {f.fact}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </Section>
      )}

      {/* Relationship map */}
      {seasonIsGenerated && activeTab === "map" && (
        <RelationshipMap
          characters={visibleCharacters.map((c) => ({ id: c.id, name: c.name, group: c.group }))}
          relationships={visibleRelationships}
          groupColors={groupColors}
        />
      )}

      {/* Timeline */}
      {seasonIsGenerated && activeTab === "timeline" && (
        visibleTimeline.length > 0 ? (
        <Section
          icon={Clock}
          title="Plot timeline"
          count={visibleTimeline.length}
          suggestButton={<SuggestEditButton companionId={data.id} defaultTargetType="timeline" label="Suggest a timeline edit" compact />}
        >
          <ol className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/40">
            {visibleTimeline.map((t) => (
              <li key={t.id} className="px-3 py-2 text-sm flex items-start gap-3">
                <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider shrink-0 mt-0.5 w-14">
                  {formatVisibleAfter(t.visibleAfter, mediaType)}
                </span>
                <span className="flex-1 text-white">{t.description}</span>
              </li>
            ))}
          </ol>
          {COMPANION_AD_SLOT && <AdUnit slot={COMPANION_AD_SLOT} format="auto" className="mt-4" />}
        </Section>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No timeline events unlocked at your current position yet.</p>
        )
      )}

      {/* Glossary */}
      {seasonIsGenerated && activeTab === "glossary" && (() => {
        if (visibleGlossary.length === 0) {
          return <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No glossary entries unlocked yet.</p>;
        }
        // Only show category pills that are actually represented in the
        // currently-visible glossary. No point offering "faction" if there
        // aren't any faction terms unlocked yet.
        const availableCategories = Array.from(new Set(
          visibleGlossary.map((g) => g.category).filter((c): c is string => !!c)
        )).sort();
        const filteredGlossary = glossaryCategoryFilter === "all"
          ? visibleGlossary
          : visibleGlossary.filter((g) => g.category === glossaryCategoryFilter);
        return (
          <Section
            icon={BookOpen}
            title="Glossary"
            count={filteredGlossary.length}
            suggestButton={<SuggestEditButton companionId={data.id} defaultTargetType="glossary" label="Suggest a glossary edit" compact />}
          >
            {availableCategories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <FilterPill
                  active={glossaryCategoryFilter === "all"}
                  onClick={() => setGlossaryCategoryFilter("all")}
                >
                  All ({visibleGlossary.length})
                </FilterPill>
                {availableCategories.map((cat) => {
                  const count = visibleGlossary.filter((g) => g.category === cat).length;
                  return (
                    <FilterPill
                      key={cat}
                      active={glossaryCategoryFilter === cat}
                      onClick={() => setGlossaryCategoryFilter(cat)}
                    >
                      {cat} ({count})
                    </FilterPill>
                  );
                })}
              </div>
            )}
            {filteredGlossary.length > 0 ? (
              <dl className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/40">
                {filteredGlossary.map((g) => (
                  <div key={g.id} className="px-3 py-2">
                    <dt className="text-sm font-semibold text-white flex items-baseline gap-2">
                      {g.term}
                      {g.category && <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{g.category}</span>}
                    </dt>
                    <dd className="text-sm text-[var(--foreground-muted)] mt-0.5 leading-relaxed">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)] italic text-center py-4">No terms in this category yet.</p>
            )}
            {COMPANION_AD_SLOT && <AdUnit slot={COMPANION_AD_SLOT} format="auto" className="mt-4" />}
          </Section>
        );
      })()}

      <CommunitySuggestions companionId={data.id} />

      {/* Global catch-all for adding brand-new items (relationships, etc.) */}
      <div className="pt-4 border-t border-[var(--border)]/40">
        <p className="text-xs text-[var(--foreground-muted)] text-center mb-3 leading-relaxed">
          Got a correction or addition? This companion is AI-drafted and community-refined — your input helps.
        </p>
        <SuggestEditButton companionId={data.id} defaultTargetType="character" />
      </div>
    </div>
  );
}

function formatVisibleAfter(va: VisibleAfter, mediaType: "movie" | "tv"): string {
  if (mediaType === "movie") return typeof va.seconds === "number" ? formatMovieTime(va.seconds) : "start";
  const s = va.season ?? 1;
  const e = va.episode ?? 1;
  return `S${s}E${e}`;
}

function compareVisibleAfter(a: VisibleAfter, b: VisibleAfter, mediaType: "movie" | "tv"): number {
  if (mediaType === "movie") return (a.seconds ?? 0) - (b.seconds ?? 0);
  const seasonDiff = (a.season ?? 1) - (b.season ?? 1);
  if (seasonDiff !== 0) return seasonDiff;
  const episodeDiff = (a.episode ?? 1) - (b.episode ?? 1);
  if (episodeDiff !== 0) return episodeDiff;
  return (a.seconds ?? 0) - (b.seconds ?? 0);
}

// Merge relationships that share (label, direction, type) so a character
// with four "father of" relationships shows ONE pill naming all four kids
// instead of four pills. Keeps pill count manageable for central characters.
interface GroupedConnection {
  key: string;
  relationshipType: string;
  label: string;
  direction: "in" | "out";
  others: string[]; // character IDs of the other parties
}

function groupConnectionsForCard(
  connections: Array<{ rel: Relationship; direction: "in" | "out" }>,
  selfId: string,
): GroupedConnection[] {
  const map = new Map<string, GroupedConnection>();
  for (const { rel, direction } of connections) {
    // Pick the "other" party by elimination: whichever endpoint isn't self.
    // Using direction to derive otherId was wrong for symmetric relationships
    // where this character is the `to` end — direction was "out" but
    // rel.toCharacterId was self, so the old code produced self and got
    // skipped by the self-loop safety net. That silently killed every
    // sibling/spouse pill whenever the current card was the second party.
    const otherId = rel.fromCharacterId === selfId ? rel.toCharacterId : rel.fromCharacterId;
    if (otherId === selfId) continue; // genuine self-loop — drop it
    const key = `${rel.relationshipType}|${rel.label}|${direction}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.others.includes(otherId)) existing.others.push(otherId);
    } else {
      map.set(key, {
        key,
        relationshipType: rel.relationshipType,
        label: rel.label,
        direction,
        others: [otherId],
      });
    }
  }
  return Array.from(map.values());
}
