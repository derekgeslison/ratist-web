"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Clock, Users, Link2, BookOpen, Lock, AlertCircle } from "lucide-react";

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
interface Character {
  id: string; name: string; actorName: string | null; actorTmdbId: number | null;
  baseDescription: string; group: string | null; imageUrl: string | null;
  visibleAfter: VisibleAfter; facts: Fact[];
}
interface Relationship {
  id: string; relationshipType: string; label: string; directed: boolean;
  fromCharacterId: string; toCharacterId: string; visibleAfter: VisibleAfter;
}
interface TimelineEvent {
  id: string; description: string; importance: number;
  characterIds: string[]; visibleAfter: VisibleAfter;
}
interface GlossaryTerm {
  id: string; term: string; definition: string;
  category: string | null; visibleAfter: VisibleAfter;
}

export interface WatchCompanionData {
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  runtimeSeconds: number | null;
  seasonsGenerated: number[];
  characters: Character[];
  relationships: Relationship[];
  timeline: TimelineEvent[];
  glossary: GlossaryTerm[];
  seasonEpisodeCounts?: Record<number, number>; // s1 → 10 episodes, etc. Optional — if absent we show a generous range.
}

function isVisible(visibleAfter: VisibleAfter, position: WatchPosition, mediaType: "movie" | "tv"): boolean {
  if (mediaType === "movie") {
    const threshold = visibleAfter.seconds ?? 0;
    const current = position.seconds ?? 0;
    return current >= threshold;
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
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const GROUP_COLORS = [
  "#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5",
  "#dd6b20", "#319795", "#d53f8c",
];

export default function WatchCompanionView({ data }: { data: WatchCompanionData }) {
  const { mediaType, runtimeSeconds, seasonsGenerated } = data;

  // Slider state — start at the very beginning so viewers opt into reveals.
  const [seconds, setSeconds] = useState<number>(0);
  const [season, setSeason] = useState<number>(seasonsGenerated[0] ?? 1);
  const [episode, setEpisode] = useState<number>(1);

  const position: WatchPosition = useMemo(
    () => mediaType === "movie"
      ? { seconds }
      : { season, episode, seconds: Number.MAX_SAFE_INTEGER },
    [mediaType, seconds, season, episode],
  );

  // Stable color-per-group assignment
  const groupColors = useMemo(() => {
    const groups = Array.from(new Set(data.characters.map((c) => c.group).filter((g): g is string => !!g)));
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g, GROUP_COLORS[i % GROUP_COLORS.length]));
    return map;
  }, [data.characters]);

  // Filter everything by current position
  const visibleCharacters = useMemo(
    () => data.characters.filter((c) => isVisible(c.visibleAfter, position, mediaType)),
    [data.characters, position, mediaType],
  );
  const visibleCharIds = useMemo(() => new Set(visibleCharacters.map((c) => c.id)), [visibleCharacters]);
  const visibleRelationships = useMemo(
    () => data.relationships.filter((r) =>
      isVisible(r.visibleAfter, position, mediaType) &&
      visibleCharIds.has(r.fromCharacterId) && visibleCharIds.has(r.toCharacterId)
    ),
    [data.relationships, position, mediaType, visibleCharIds],
  );
  const visibleTimeline = useMemo(
    () => data.timeline.filter((t) => isVisible(t.visibleAfter, position, mediaType)).sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType)),
    [data.timeline, position, mediaType],
  );
  const visibleGlossary = useMemo(
    () => data.glossary.filter((g) => isVisible(g.visibleAfter, position, mediaType)),
    [data.glossary, position, mediaType],
  );

  const nameOf = (id: string) => data.characters.find((c) => c.id === id)?.name ?? "(unknown)";

  // Count hidden items so users know more is there
  const hiddenCount = (data.characters.length - visibleCharacters.length)
    + (data.relationships.length - visibleRelationships.length)
    + (data.timeline.length - visibleTimeline.length)
    + (data.glossary.length - visibleGlossary.length);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Spoiler slider — sticky on mobile so it's always reachable */}
      <div className="sticky top-2 z-20 bg-[var(--background)]/95 backdrop-blur-sm border border-[var(--border)] rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">Where are you?</p>
            <p className="text-sm text-white mt-0.5">
              {mediaType === "movie"
                ? `${formatMovieTime(seconds)} of ${runtimeSeconds ? formatMovieTime(runtimeSeconds) : "?"}`
                : `Season ${season}, Episode ${episode}`}
            </p>
          </div>
          {hiddenCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
              <Lock className="w-3.5 h-3.5" /> {hiddenCount} hidden
            </span>
          )}
        </div>

        {mediaType === "movie" && runtimeSeconds ? (
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
        ) : mediaType === "tv" ? (
          <div className="flex items-center gap-2">
            <select
              value={season}
              onChange={(e) => { setSeason(parseInt(e.target.value, 10)); setEpisode(1); }}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
              aria-label="Season"
            >
              {seasonsGenerated.length > 0
                ? seasonsGenerated.map((s) => <option key={s} value={s}>Season {s}</option>)
                : <option value={1}>Season 1</option>}
            </select>
            <select
              value={episode}
              onChange={(e) => setEpisode(parseInt(e.target.value, 10))}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
              aria-label="Episode"
            >
              {Array.from({ length: data.seasonEpisodeCounts?.[season] ?? 24 }, (_, i) => i + 1).map((e) => (
                <option key={e} value={e}>Episode {e}</option>
              ))}
            </select>
          </div>
        ) : null}

        <p className="text-[10px] text-[var(--foreground-muted)] mt-2 leading-relaxed">
          Drag the slider {mediaType === "tv" ? "or pick a later episode" : ""} as you watch. Spoilers ahead are hidden until you get there.
        </p>
      </div>

      {/* Warning if nothing is visible yet */}
      {visibleCharacters.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Move the slider forward to see characters and events as they appear in the story.</span>
        </div>
      )}

      {/* Cast */}
      {visibleCharacters.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-base font-semibold text-white">Cast</h2>
            <span className="text-xs text-[var(--foreground-muted)]">({visibleCharacters.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleCharacters.map((c) => {
              const color = c.group ? groupColors.get(c.group) ?? GROUP_COLORS[0] : GROUP_COLORS[0];
              const visibleFacts = c.facts.filter((f) => isVisible(f.visibleAfter, position, mediaType));
              return (
                <div
                  key={c.id}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <div className="flex items-start gap-3">
                    {c.imageUrl ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                        <Image src={c.imageUrl} alt={c.name} fill sizes="48px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-white font-bold shrink-0">
                        {c.name[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{c.name}</p>
                      {c.actorName && (
                        <p className="text-[11px] text-[var(--foreground-muted)]">played by {c.actorName}</p>
                      )}
                      {c.group && (
                        <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color }}>{c.group}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">{c.baseDescription}</p>
                  {visibleFacts.length > 0 && (
                    <ul className="mt-2 pt-2 border-t border-[var(--border)]/40 space-y-1">
                      {visibleFacts.map((f) => (
                        <li key={f.id} className="text-xs text-[var(--foreground-muted)] flex items-start gap-2">
                          <span className="text-[9px] uppercase tracking-wider font-semibold shrink-0 mt-0.5" style={{ color }}>
                            {f.factType.replace(/_/g, " ")}
                          </span>
                          <span className="flex-1">{f.fact}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Relationships */}
      {visibleRelationships.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-base font-semibold text-white">Relationships</h2>
            <span className="text-xs text-[var(--foreground-muted)]">({visibleRelationships.length})</span>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/40">
            {visibleRelationships.map((r) => (
              <div key={r.id} className="px-3 py-2 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-white">{nameOf(r.fromCharacterId)}</span>
                <span className="text-[var(--foreground-muted)] italic text-xs">
                  {r.directed ? "→" : "↔"} {r.label}
                </span>
                <span className="font-medium text-white">{nameOf(r.toCharacterId)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timeline */}
      {visibleTimeline.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-base font-semibold text-white">Plot timeline</h2>
            <span className="text-xs text-[var(--foreground-muted)]">({visibleTimeline.length})</span>
          </div>
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
        </section>
      )}

      {/* Glossary */}
      {visibleGlossary.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-base font-semibold text-white">Glossary</h2>
            <span className="text-xs text-[var(--foreground-muted)]">({visibleGlossary.length})</span>
          </div>
          <dl className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/40">
            {visibleGlossary.map((g) => (
              <div key={g.id} className="px-3 py-2">
                <dt className="text-sm font-semibold text-white flex items-baseline gap-2">
                  {g.term}
                  {g.category && <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{g.category}</span>}
                </dt>
                <dd className="text-sm text-[var(--foreground-muted)] mt-0.5 leading-relaxed">{g.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function formatVisibleAfter(va: VisibleAfter, mediaType: "movie" | "tv"): string {
  if (mediaType === "movie") {
    return typeof va.seconds === "number" ? formatMovieTime(va.seconds) : "start";
  }
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
