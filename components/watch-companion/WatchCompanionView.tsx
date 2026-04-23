"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Users, BookOpen, Lock, AlertCircle, ChevronDown, Heart, Briefcase, Swords, Handshake, GraduationCap, Link2, Sparkles } from "lucide-react";
import SuggestEditButton from "./SuggestEditButton";
import CommunitySuggestions from "./CommunitySuggestions";

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
  seasonEpisodeCounts?: Record<number, number>;
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
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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

// Collapsible section wrapper with optional inline suggest button
function Section({
  icon: Icon, title, count, defaultOpen = true, children, suggestButton,
}: {
  icon: typeof Users; title: string; count?: number; defaultOpen?: boolean;
  children: React.ReactNode; suggestButton?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 flex-1 text-left group"
          aria-expanded={open}
        >
          <Icon className="w-4 h-4 text-[var(--ratist-red)]" />
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {count !== undefined && <span className="text-xs text-[var(--foreground-muted)]">({count})</span>}
          <ChevronDown className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ml-auto group-hover:text-white ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          {children}
          {suggestButton && <div className="flex justify-end pt-1">{suggestButton}</div>}
        </div>
      )}
    </section>
  );
}

export default function WatchCompanionView({ data }: { data: WatchCompanionData }) {
  const { mediaType, runtimeSeconds, seasonsGenerated } = data;

  const episodeSlots = useMemo(
    () => mediaType === "tv" ? buildEpisodeSlots(seasonsGenerated, data.seasonEpisodeCounts ?? {}) : [],
    [mediaType, seasonsGenerated, data.seasonEpisodeCounts],
  );

  const [seconds, setSeconds] = useState<number>(0);
  const [slotIndex, setSlotIndex] = useState<number>(0);
  const currentSlot = episodeSlots[slotIndex] ?? { season: seasonsGenerated[0] ?? 1, episode: 1 };

  const position: WatchPosition = useMemo(
    () => mediaType === "movie"
      ? { seconds }
      : { season: currentSlot.season, episode: currentSlot.episode, seconds: Number.MAX_SAFE_INTEGER },
    [mediaType, seconds, currentSlot],
  );

  const groupColors = useMemo(() => {
    const groups = Array.from(new Set(data.characters.map((c) => c.group).filter((g): g is string => !!g)));
    const map = new Map<string, string>();
    groups.forEach((g, i) => map.set(g, GROUP_COLORS[i % GROUP_COLORS.length]));
    return map;
  }, [data.characters]);

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
    () => data.timeline.filter((t) => isVisible(t.visibleAfter, position, mediaType))
      .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType)),
    [data.timeline, position, mediaType],
  );
  const visibleGlossary = useMemo(
    () => data.glossary.filter((g) => isVisible(g.visibleAfter, position, mediaType)),
    [data.glossary, position, mediaType],
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
    (data.characters.length - visibleCharacters.length) +
    (data.relationships.length - visibleRelationships.length) +
    (data.timeline.length - visibleTimeline.length) +
    (data.glossary.length - visibleGlossary.length);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Disclaimer — small, non-intrusive */}
      <p className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1.5 leading-relaxed">
        <Sparkles className="w-3 h-3 shrink-0 text-[var(--ratist-red)]/70" />
        AI-drafted and community-refined — accuracy improves as users contribute corrections.
      </p>

      {/* Spoiler slider */}
      <div className="sticky top-2 z-20 bg-[var(--background)]/95 backdrop-blur-sm border border-[var(--border)] rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">Where are you?</p>
            <p className="text-sm text-white mt-0.5">
              {mediaType === "movie"
                ? `${formatMovieTime(seconds)} of ${runtimeSeconds ? formatMovieTime(runtimeSeconds) : "?"}`
                : `Season ${currentSlot.season}, Episode ${currentSlot.episode}`}
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
        ) : mediaType === "tv" && episodeSlots.length > 0 ? (
          <input
            type="range"
            min={0}
            max={episodeSlots.length - 1}
            step={1}
            value={slotIndex}
            onChange={(e) => setSlotIndex(parseInt(e.target.value, 10))}
            className="w-full accent-[var(--ratist-red)]"
            aria-label="Episode position"
          />
        ) : null}

        <p className="text-[10px] text-[var(--foreground-muted)] mt-2 leading-relaxed">
          Drag the slider as you watch. Spoilers past your position stay hidden.
        </p>
      </div>

      {visibleCharacters.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Move the slider forward to see characters and events as they appear in the story.</span>
        </div>
      )}

      {/* Cast with embedded relationships */}
      {visibleCharacters.length > 0 && (
        <Section
          icon={Users}
          title="Cast"
          count={visibleCharacters.length}
          suggestButton={<SuggestEditButton companionId={data.id} defaultTargetType="character" label="Suggest a character edit" compact />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleCharacters.map((c) => {
              const color = c.group ? groupColors.get(c.group) ?? GROUP_COLORS[0] : GROUP_COLORS[0];
              const visibleFacts = c.facts.filter((f) => isVisible(f.visibleAfter, position, mediaType));
              const connections = relationshipsByCharacter.get(c.id) ?? [];
              return (
                <div
                  key={c.id}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <div className="flex items-start gap-3">
                    {c.actorTmdbId ? (
                      <Link href={`/celebrities/${c.actorTmdbId}`} className="shrink-0" aria-label={c.actorName ?? c.name}>
                        {c.imageUrl ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[var(--surface-2)] hover:ring-2 hover:ring-[var(--ratist-red)] transition-all">
                            <Image src={c.imageUrl} alt={c.name} fill sizes="48px" className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-white font-bold hover:ring-2 hover:ring-[var(--ratist-red)] transition-all">
                            {c.name[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                      </Link>
                    ) : c.imageUrl ? (
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
                        c.actorTmdbId ? (
                          <Link href={`/celebrities/${c.actorTmdbId}`} className="text-[11px] text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
                            played by {c.actorName}
                          </Link>
                        ) : (
                          <p className="text-[11px] text-[var(--foreground-muted)]">played by {c.actorName}</p>
                        )
                      )}
                      {c.group && <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color }}>{c.group}</p>}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">{c.baseDescription}</p>

                  {connections.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border)]/40 flex flex-wrap gap-1.5">
                      {connections.map(({ rel, direction }) => {
                        const RelIcon = RELATIONSHIP_ICONS[rel.relationshipType] ?? Link2;
                        const relColor = RELATIONSHIP_COLORS[rel.relationshipType] ?? RELATIONSHIP_COLORS.other;
                        // Render the relationship as a full "FromName label
                        // ToName" sentence. The OTHER party is highlighted so
                        // the viewer knows who this card's character is in
                        // relation to. Avoids the "Kendall is father of Logan"
                        // inversion bug that flipping arrow direction caused.
                        const fromIsSelf = direction === "out";
                        const fromClass = fromIsSelf ? "text-[var(--foreground-muted)]" : "text-white font-semibold";
                        const toClass = fromIsSelf ? "text-white font-semibold" : "text-[var(--foreground-muted)]";
                        return (
                          <span
                            key={rel.id + direction}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-[var(--surface-2)]/50 text-[10px] ${relColor}`}
                          >
                            <RelIcon className="w-3 h-3 shrink-0" />
                            <span className={fromClass}>{nameOf(rel.fromCharacterId)}</span>
                            <span className="italic">{rel.label}</span>
                            <span className={toClass}>{nameOf(rel.toCharacterId)}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

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
        </Section>
      )}

      {/* Timeline */}
      {visibleTimeline.length > 0 && (
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
        </Section>
      )}

      {/* Glossary — collapsed by default since it's supplementary */}
      {visibleGlossary.length > 0 && (
        <Section
          icon={BookOpen}
          title="Glossary"
          count={visibleGlossary.length}
          defaultOpen={false}
          suggestButton={<SuggestEditButton companionId={data.id} defaultTargetType="glossary" label="Suggest a glossary edit" compact />}
        >
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
        </Section>
      )}

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
