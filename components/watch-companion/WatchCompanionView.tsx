"use client";

import { useState, useMemo, useEffect } from "react";
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

  const episodeSlots = useMemo(
    () => mediaType === "tv" ? buildEpisodeSlots(seasonsGenerated, data.seasonEpisodeCounts ?? {}) : [],
    [mediaType, seasonsGenerated, data.seasonEpisodeCounts],
  );

  // Persist slider position per-companion in localStorage so tapping an actor
  // and coming back doesn't snap the viewer to the start of episode 1.
  const storageKey = `watchcompanion:${data.id}`;
  const [seconds, setSeconds] = useState<number>(0);
  const [slotIndex, setSlotIndex] = useState<number>(0);
  const [episodeSeconds, setEpisodeSeconds] = useState<number>(0);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<"cast" | "timeline" | "glossary">("cast");

  // Restore on mount (client only; avoids hydration mismatch by deferring)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { seconds?: number; slotIndex?: number; episodeSeconds?: number };
        if (typeof saved.seconds === "number") setSeconds(saved.seconds);
        if (typeof saved.slotIndex === "number") setSlotIndex(saved.slotIndex);
        if (typeof saved.episodeSeconds === "number") setEpisodeSeconds(saved.episodeSeconds);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, [storageKey]);

  // Persist on change (only after initial hydrate so we don't overwrite with defaults)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ seconds, slotIndex, episodeSeconds }));
    } catch { /* storage full or disabled — ignore */ }
  }, [hydrated, storageKey, seconds, slotIndex, episodeSeconds]);
  const currentSlot = episodeSlots[slotIndex] ?? { season: seasonsGenerated[0] ?? 1, episode: 1 };

  const position: WatchPosition = useMemo(
    () => mediaType === "movie"
      ? { seconds }
      : { season: currentSlot.season, episode: currentSlot.episode, seconds: episodeSeconds },
    [mediaType, seconds, currentSlot, episodeSeconds],
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

      {/* Sticky cluster: slider + tabs ride together just below the site
         navbar (72px tall). Both panes stay visible when scrolling. */}
      <div className="sticky top-[72px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2 pt-2 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border)]/50">
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
        {/* Spoiler slider explainer — helps first-time users understand that
           they need to move the slider themselves as they watch. Without
           this hint the UI feels frozen at S1E1. */}
        <p className="text-[10px] text-[var(--foreground-muted)] leading-relaxed mt-2 flex items-start gap-1.5">
          <Lock className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold text-white">Slide as you watch.</span>{" "}
            Characters, relationships, timeline beats and glossary terms unlock as you move the slider forward so nothing gets spoiled.
          </span>
        </p>
      </div>

        {/* Tabs — part of the sticky cluster so they stay visible too */}
        {visibleCharacters.length > 0 && (
          <nav className="flex gap-1 border-b border-[var(--border)] overflow-x-auto mt-2 -mb-2">
            {([
              { key: "cast", label: "Cast", icon: Users, count: visibleCharacters.length },
              { key: "timeline", label: "Timeline", icon: Clock, count: visibleTimeline.length },
              { key: "glossary", label: "Glossary", icon: BookOpen, count: visibleGlossary.length },
            ] as const).map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
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

      {visibleCharacters.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Move the slider forward to see characters and events as they appear in the story.</span>
        </div>
      )}

      {/* Cast with embedded relationships */}
      {activeTab === "cast" && visibleCharacters.length > 0 && (
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
      {activeTab === "timeline" && (
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
        </Section>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No timeline events unlocked at your current position yet.</p>
        )
      )}

      {/* Glossary */}
      {activeTab === "glossary" && (
        visibleGlossary.length > 0 ? (
        <Section
          icon={BookOpen}
          title="Glossary"
          count={visibleGlossary.length}
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
        ) : (
          <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No glossary entries unlocked yet.</p>
        )
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
