"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Users, BookOpen, Lock, AlertCircle, ChevronDown, Heart, Briefcase, Swords, Handshake, GraduationCap, Link2, Sparkles, Network, Pencil, Plus, Check, ThumbsUp, ThumbsDown, Loader2, ScrollText, EyeOff } from "lucide-react";
import RelationshipMap from "./RelationshipMap";
import RateCompanion from "./RateCompanion";
import CompanionNotAvailable from "./CompanionNotAvailable";
import AdUnit from "@/components/AdUnit";
import CompanionItemEditor, { type EditorDraft } from "@/components/admin/CompanionItemEditor";
import ItemSuggestions, { type SuggestionRow } from "./ItemSuggestions";
import { useAuth } from "@/context/AuthContext";
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
  /** Keys of "{targetType}:{itemId}" for items that were created or edited
   *  via a community-approved suggestion. Drives the community-sourced
   *  badge in the viewer. */
  communityItemIds?: string[];
  /** Recap-tab content. Two blocks per page: an INSTALLMENT recap for
   *  the current movie / season, and an optional SERIES recap that
   *  compresses every prior installment plus the current one into a
   *  single ~150–250 word block. The series block is null for the
   *  first installment (S1, or a standalone movie) since it'd just
   *  duplicate the installment recap.
   *
   *  - Movies: a single object describing the current film. Even when
   *    the user navigates to Dune 2's companion, this is just Dune 2's
   *    pair (the series block already includes prior films).
   *  - TV: a per-season map keyed by season-number-as-string. The
   *    viewer reads only the slot for the currently-viewed season; no
   *    stacking, no concatenation. */
  recaps?: {
    movie?: { installment: string; series: string | null };
    bySeason?: Record<string, { installment: string; series: string | null }>;
  };
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

// Small "community-sourced" badge rendered on items that were created or
// edited via a community-approved suggestion. Distinct from the pending
// ItemSuggestions bubble (red) — uses a green checkmark badge so users
// can tell "this content was vetted by the community" at a glance.
function CommunityBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${compact ? "text-[9px]" : "text-[10px]"} px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400`}
      title="Community-sourced — this was added or edited via a community suggestion"
    >
      <Users className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      <Check className={compact ? "w-2 h-2 -ml-0.5" : "w-2.5 h-2.5 -ml-0.5"} />
    </span>
  );
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

// Section wrapper — title is sr-only since the tab nav already names the
// section visually. No suggest-edit button: per-item pencil edits and
// per-section "Suggest a new …" Plus buttons cover that surface; the
// generic free-text suggestion form was removed because it produced
// low-signal "comments" that weren't actionable.
function Section({
  title, children,
}: {
  // Icon/count/defaultOpen kept as accepted props for call-site continuity
  // but no longer rendered — tabs make section-level collapse redundant.
  icon?: typeof Users; title: string; count?: number; defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="sr-only">{title}</div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function WatchCompanionView({ data }: { data: WatchCompanionData }) {
  const { user } = useAuth();
  // Structured-suggestion modal state. Null when closed. Drives the shared
  // CompanionItemEditor in suggest-mode so users propose edits with the
  // same per-type fields admins use.
  const [suggestDraft, setSuggestDraft] = useState<EditorDraft | null>(null);
  const [suggestionJustSent, setSuggestionJustSent] = useState(false);
  // All pending suggestions for this companion — fetched once, filtered
  // per-item for the bubble indicators. Refetched after vote, submit, or
  // auto-resolve.
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionRow[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  async function getSuggestToken() {
    return (await user?.getIdToken()) ?? "";
  }
  async function fetchSuggestions() {
    try {
      const headers: Record<string, string> = {};
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/watch-companion/${data.id}/suggestions?status=pending`, { headers });
      if (!res.ok) return;
      const json = await res.json();
      setPendingSuggestions(json.suggestions ?? []);
      setMyVotes(json.myVotes ?? {});
    } catch { /* silent */ }
  }
  useEffect(() => { fetchSuggestions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data.id, user?.uid]);
  function onSuggestionChanged() {
    fetchSuggestions();
  }
  function suggestionsFor(targetType: string, targetId: string | null): SuggestionRow[] {
    return pendingSuggestions.filter((s) => s.targetType === targetType && s.targetId === targetId);
  }
  // Spoiler gate for ADD suggestions: their payload carries a visibleAfter
  // for the proposed new item. A viewer sitting at 0:30 shouldn't see a
  // proposed "Betrayal at 1:45" suggestion — that'd spoil the future beat
  // they're trying to avoid. Edit/remove suggestions target already-visible
  // items so they don't need the check here.
  function addSuggestionIsPastPosition(s: SuggestionRow): boolean {
    const p = (s.payload ?? {}) as { visibleAfter?: VisibleAfter };
    if (!p.visibleAfter) return true; // unknown timing — allow (no spoiler known)
    return isVisible(p.visibleAfter, position, mediaType);
  }
  // Per-character ADD-relationship suggestions stay on the character card's
  // top bubble (there's no dedicated "relationships" section per card to
  // show them in). Add-fact goes to its own per-character events bubble.
  function addRelationshipSuggestionsForCharacter(characterId: string): SuggestionRow[] {
    return pendingSuggestions.filter((s) => {
      if (s.action !== "add" || s.targetType !== "relationship") return false;
      const p = (s.payload ?? {}) as Record<string, unknown>;
      if (p.fromCharacterId !== characterId) return false;
      return addSuggestionIsPastPosition(s);
    });
  }
  function addFactSuggestionsForCharacter(characterId: string): SuggestionRow[] {
    return pendingSuggestions.filter((s) => {
      if (s.action !== "add" || s.targetType !== "fact") return false;
      const p = (s.payload ?? {}) as Record<string, unknown>;
      if (p.characterId !== characterId) return false;
      return addSuggestionIsPastPosition(s);
    });
  }
  function sectionAddSuggestions(targetType: "character" | "timeline" | "glossary"): SuggestionRow[] {
    return pendingSuggestions
      .filter((s) => s.action === "add" && s.targetType === targetType)
      .filter(addSuggestionIsPastPosition);
  }
  // Fast lookup for the "community-sourced" badge.
  const communityItemSet = useMemo(
    () => new Set(data.communityItemIds ?? []),
    [data.communityItemIds],
  );
  function isCommunitySourced(targetType: string, itemId: string): boolean {
    return communityItemSet.has(`${targetType}:${itemId}`);
  }
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
  const [activeTab, setActiveTab] = useState<"cast" | "map" | "timeline" | "glossary" | "recap">("cast");
  // Recap content stays hidden behind a reveal button per-tab-visit
  // because it intentionally contains full spoilers — it's the
  // "remind me what happened in the prior installments" tool, not a
  // slider-gated discovery surface. We keep this as session-scoped
  // state so it resets on companion reload.
  const [recapRevealed, setRecapRevealed] = useState(false);
  const [glossaryCategoryFilter, setGlossaryCategoryFilter] = useState<string | "all">("all");
  // Multi-select character filter for the Timeline tab. AND semantics —
  // events must include EVERY selected character to remain visible. With
  // one selected the user gets "Tyrion's beats"; with two the user gets
  // "scenes Tyrion and Bronn shared".
  const [timelineCharFilter, setTimelineCharFilter] = useState<string[]>([]);

  // Refs to character card DOM nodes so a chip on a timeline event can
  // scroll its target into view. Map indexed by character id so React's
  // re-render churn doesn't break the lookup.
  const characterCardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [pendingScrollCharacterId, setPendingScrollCharacterId] = useState<string | null>(null);

  const scrollToCharacter = useCallback((characterId: string) => {
    setActiveTab("cast");
    setPendingScrollCharacterId(characterId);
    track("companion_chip_jump", { companion_id: data.id, target_character_id: characterId });
  }, [data.id]);

  // Refs for the timeline list <li> rows so the swim-lane pins can
  // scroll-into-view + highlight the matching event below the chart.
  // No tab switch needed — both views live on the Timeline tab.
  const timelineEventRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());
  const scrollToTimelineEvent = useCallback((eventId: string) => {
    const el = timelineEventRefs.current.get(eventId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "2px solid var(--ratist-red)";
    el.style.outlineOffset = "2px";
    el.style.transition = "outline-color 800ms ease-out";
    setTimeout(() => {
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.transition = "";
    }, 1200);
    track("companion_lane_pin_click", { companion_id: data.id, event_id: eventId });
  }, [data.id]);

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

  // Scroll-to-character once the cast tab is active and the target ref is
  // attached. Two-step (set tab, then scroll on next render) because the
  // card DOM doesn't exist while activeTab is anything other than "cast".
  useEffect(() => {
    if (!pendingScrollCharacterId || activeTab !== "cast") return;
    const target = characterCardRefs.current.get(pendingScrollCharacterId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // Brief highlight flash so the user's eye finds the right card after
      // a tab swap and scroll. Tailwind doesn't have an arbitrary class for
      // this so we drive it via inline outline + a setTimeout cleanup.
      target.style.outline = "2px solid var(--ratist-red)";
      target.style.outlineOffset = "2px";
      target.style.transition = "outline-color 800ms ease-out";
      setTimeout(() => {
        target.style.outline = "";
        target.style.outlineOffset = "";
        target.style.transition = "";
      }, 1200);
    }
    setPendingScrollCharacterId(null);
  }, [pendingScrollCharacterId, activeTab]);
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

  const visibleCharacters = useMemo(() => {
    const visible = seasonCharacters.filter((c) => isVisible(c.visibleAfter, position, mediaType));
    if (visible.length > 0) return visible;
    // Fallback so the cast list is never empty: when nothing is unlocked at
    // the current position (typically because no character's visibleAfter
    // is at 0/start), surface the EARLIEST-introduced character(s) anyway.
    // Every character sharing the min visibleAfter comes through, so an
    // ensemble opening doesn't lose half its debut cast.
    if (seasonCharacters.length === 0) return [];
    const sorted = [...seasonCharacters].sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
    const earliest = sorted[0].visibleAfter;
    return sorted.filter((c) => compareVisibleAfter(c.visibleAfter, earliest, mediaType) === 0);
  }, [seasonCharacters, position, mediaType]);
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
  // Lookup table for quick id → Character resolution. Used by the timeline
  // event chips and the per-character "story beats" mini-timeline. Keyed
  // off all data.characters (not just visibleCharacters) so a chip can
  // resolve a character that's tagged in an unlocked timeline event but
  // hasn't yet appeared on screen.
  const characterById = useMemo(() => {
    const m = new Map<string, Character>();
    for (const c of data.characters) m.set(c.id, c);
    return m;
  }, [data.characters]);
  // Name-keyed lookup for parsing inline ((Name)) markers in timeline
  // event descriptions. Aliases aren't included — the AI prompt always
  // emits the original c.name in tags so the lookup stays simple.
  const characterByName = useMemo(() => {
    const m = new Map<string, Character>();
    for (const c of data.characters) m.set(c.name, c);
    return m;
  }, [data.characters]);
  // Apply the multi-select character filter on top of the slider-visible
  // timeline. AND semantics — an event must mention every selected
  // character id to make the cut. Empty filter = all events.
  const filteredTimeline = useMemo(
    () => timelineCharFilter.length === 0
      ? visibleTimeline
      : visibleTimeline.filter((t) =>
          timelineCharFilter.every((id) => t.characterIds.includes(id))
        ),
    [visibleTimeline, timelineCharFilter],
  );
  // Characters that actually appear in at least one currently-visible
  // timeline event. Drives the filter pill row — no point offering a pill
  // for a character no event tags. Sorted by name for stable ordering.
  const timelineFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of visibleTimeline) for (const id of t.characterIds) ids.add(id);
    return Array.from(ids)
      .map((id) => characterById.get(id))
      .filter((c): c is Character => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleTimeline, characterById]);

  // Swim-lane data for the visualization above the timeline list. One
  // lane per character (in cast/group order) for any character that
  // appears in at least one visible event. Each event is mapped to a
  // 0..1 fraction along the runtime/season so pins can be positioned
  // with percentage-based CSS. Movies use seconds/runtimeSeconds. TV
  // approximates with (episodeIndex + secondsWithinEp/epRuntime) /
  // totalEpisodes — gives reasonable spacing without modeling
  // per-episode runtime variance.
  const timelineLanes = useMemo(() => {
    if (visibleTimeline.length === 0) return null;
    const totalEpisodes = mediaType === "tv"
      ? (data.seasonEpisodeCounts?.[selectedSeason] ?? 12)
      : 1;
    const epRuntime = data.defaultEpisodeRuntimeSeconds ?? 3600;
    const movieRuntime = data.runtimeSeconds && data.runtimeSeconds > 0 ? data.runtimeSeconds : 7200;

    function fractionOf(va: VisibleAfter): number {
      if (mediaType === "movie") {
        return Math.max(0, Math.min(1, (va.seconds ?? 0) / movieRuntime));
      }
      const epIdx = ((va.episode ?? 1) - 1);
      const within = epRuntime > 0 ? Math.max(0, Math.min(1, (va.seconds ?? 0) / epRuntime)) : 0;
      return Math.max(0, Math.min(1, (epIdx + within) / Math.max(1, totalEpisodes)));
    }

    // Pre-compute filtered ids so the dot rendering can dim non-matching
    // events instead of hiding them entirely. Keeping non-matches visible
    // (just dimmed) preserves the "context" feel of the chart even when
    // a filter is active.
    const filteredIds = new Set(filteredTimeline.map((t) => t.id));

    // Use visibleCharacters order (which already respects the cast-grid
    // ordering — group-clustered) so the lane order matches what the
    // user sees in the Cast tab.
    const lanes = visibleCharacters
      .map((c) => {
        const events = visibleTimeline
          .filter((t) => t.characterIds.includes(c.id))
          .map((t) => ({ event: t, fraction: fractionOf(t.visibleAfter), included: filteredIds.has(t.id) }));
        return { character: c, events };
      })
      .filter((l) => l.events.length > 0);

    const currentFraction = mediaType === "movie"
      ? fractionOf({ seconds })
      : fractionOf({ season: currentSlot.season, episode: currentSlot.episode, seconds: episodeSeconds });

    // Axis labels for the bottom of the chart.
    let startLabel: string, midLabel: string, endLabel: string;
    if (mediaType === "movie") {
      startLabel = "0:00";
      midLabel = formatMovieTime(Math.floor(movieRuntime / 2));
      endLabel = formatMovieTime(movieRuntime);
    } else {
      startLabel = "Ep 1";
      midLabel = `Ep ${Math.max(1, Math.ceil(totalEpisodes / 2))}`;
      endLabel = `Ep ${totalEpisodes}`;
    }

    return { lanes, currentFraction, startLabel, midLabel, endLabel };
  }, [
    visibleTimeline, filteredTimeline, visibleCharacters, mediaType,
    data.runtimeSeconds, data.seasonEpisodeCounts, data.defaultEpisodeRuntimeSeconds,
    selectedSeason, seconds, currentSlot, episodeSeconds,
  ]);
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

      {/* Rate-this-companion. Sits at the very top of content (just under
         the disclaimer) so feedback is the first interaction a returning
         user lands on — quickest path to the moderator queue when a
         companion is going wrong. Counts are intentionally hidden from
         the front-end; only the admin page surfaces aggregates. Per-
         season scope on TV so a viewer can rate S1 and S2 independently. */}
      <RateCompanion
        companionId={data.id}
        seasonNumber={mediaType === "tv" ? selectedSeason : 0}
        seasonLabel={mediaType === "tv" ? `Season ${selectedSeason}` : null}
      />

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
        {seasonIsGenerated && visibleCharacters.length > 0 && (() => {
          // Recap tab is conditional on the companion having recap
          // content for the currently-viewed installment. Movies hide
          // it when there's no installment text on the slot; TV hides
          // it when the current season's slot is missing or empty.
          // Tab counter shows how many blocks the user will see (1
          // for installment-only, 2 for installment + series).
          const movieSlot = data.recaps?.movie ?? null;
          const tvSlot = data.recaps?.bySeason?.[String(selectedSeason)] ?? null;
          const slot = mediaType === "movie" ? movieSlot : tvSlot;
          const recapCount = slot ? (slot.series ? 2 : slot.installment ? 1 : 0) : 0;
          const showRecapTab = recapCount > 0;
          // const-assert each entry so the discriminated union narrows
          // to "cast" | "map" | "glossary" | "timeline" | "recap" rather
          // than collapsing to plain string.
          const tabs: Array<{ key: "cast" | "map" | "glossary" | "timeline" | "recap"; label: string; icon: typeof Users; count: number }> = [
            { key: "cast", label: "Cast", icon: Users, count: visibleCharacters.length },
            { key: "map", label: "Map", icon: Network, count: visibleRelationships.length },
            { key: "glossary", label: "Glossary", icon: BookOpen, count: visibleGlossary.length },
            { key: "timeline", label: "Timeline", icon: Clock, count: visibleTimeline.length },
            ...(showRecapTab ? [{ key: "recap" as const, label: "Recap", icon: ScrollText, count: recapCount }] : []),
          ];
          return (
          <nav className="flex gap-1 border-b border-[var(--border)] overflow-x-auto mt-2 -mb-2">
            {tabs.map(({ key, label, icon: Icon, count }) => (
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
          );
        })()}
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
        // Only reachable when no characters were generated at all — the
        // fallback above guarantees at least the earliest-appearing
        // characters surface whenever seasonCharacters has any entries.
        <div className="flex items-start gap-2 text-sm text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>No characters have been generated for this season yet.</span>
        </div>
      )}

      {/* Cast with embedded relationships */}
      {seasonIsGenerated && activeTab === "cast" && visibleCharacters.length > 0 && (
        <Section
          icon={Users}
          title="Cast"
          count={visibleCharacters.length}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleCharacters.map((c, idx) => {
              const color = c.group ? groupColors.get(c.group) ?? GROUP_COLORS[0] : GROUP_COLORS[0];
              const visibleFacts = c.facts.filter((f) => isVisible(f.visibleAfter, position, mediaType));
              const connections = relationshipsByCharacter.get(c.id) ?? [];

              // Resolve the name to display — latest unlocked alias, falling
              // back to the base name. Computed BEFORE actor resolution so
              // the alias-revert override below can see it.
              const unlockedAliases = (c.nameAliases ?? [])
                .filter((n) => isVisible(n.visibleAfter, position, mediaType))
                .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
              const displayName = unlockedAliases[unlockedAliases.length - 1]?.name ?? c.name;
              // Suppress the parenthetical when the latest alias matches the
              // original name — covers the Jumanji-style "swap back to self
              // at the end" case where the consciousness card cycles
              // Spencer → Bravestone → Ming → Spencer; without this guard
              // we'd render "Spencer (originally Spencer Gilpin)".
              const hasAliasReveal = unlockedAliases.length > 0 && displayName !== c.name;
              const aliasRevertedToOriginal = unlockedAliases.length > 0 && displayName === c.name;

              // Resolve the "current" actor(s) at the user's slider position.
              // Any actors sharing the LATEST unlocked visibleAfter are all
              // current — this is how we handle twins / interchangeable
              // co-stars playing one role (Olsen twins as Michelle Tanner).
              // Earlier-unlocked actors land in pastActors. Falls back to
              // the primary actor on the character row when the side-table
              // is empty (pre-migration data).
              const unlockedActors = (c.actors ?? [])
                .filter((a) => isVisible(a.visibleAfter, position, mediaType))
                .sort((a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType));
              const fallbackActor = c.actorName ? {
                actorName: c.actorName,
                actorTmdbId: c.actorTmdbId,
                note: null as string | null,
                visibleAfter: c.visibleAfter,
                imageUrl: c.imageUrl,
              } : null;
              const latestUnlocked = unlockedActors[unlockedActors.length - 1];
              const baseCurrentActors = latestUnlocked
                ? unlockedActors.filter((a) => compareVisibleAfter(a.visibleAfter, latestUnlocked.visibleAfter, mediaType) === 0)
                : fallbackActor ? [fallbackActor] : [];

              // Alias-revert override: when the displayed name has cycled
              // back to c.name (Jumanji's Spencer ending the movie back as
              // himself), the actor row should match — Alex Wolff, not the
              // last-seen avatar actor. The AI is supposed to emit a final
              // actors[] entry restoring the original, but in practice it
              // sometimes only updates nameAliases. This safety net forces
              // the current-actor row to the fallback whenever the alias
              // says we're back to the original identity but actors[]
              // hasn't caught up. Doesn't fire when the AI did emit the
              // revert (because the matching fallback actor is already in
              // baseCurrentActors).
              const fallbackId = fallbackActor ? (fallbackActor.actorTmdbId ?? fallbackActor.actorName) : null;
              const fallbackInCurrent = fallbackId !== null
                && baseCurrentActors.some((a) => (a.actorTmdbId ?? a.actorName) === fallbackId);
              const currentActors = aliasRevertedToOriginal && fallbackActor && !fallbackInCurrent
                ? [fallbackActor]
                : baseCurrentActors;

              // Past actors — drop anyone whose actor identity is currently
              // active (regardless of note differences), then dedup what
              // remains by (actor, note) so distinct vessel periods stay
              // visible in the swap log but identical repeats collapse.
              const actorIdOnly = (a: { actorName: string; actorTmdbId: number | null }) =>
                a.actorTmdbId ?? a.actorName;
              const actorKey = (a: { actorName: string; actorTmdbId: number | null; note: string | null }) =>
                `${actorIdOnly(a)}|${a.note ?? ""}`;
              const currentIds = new Set(currentActors.map(actorIdOnly));
              const seenPast = new Set<string>();
              const pastActors = unlockedActors
                .filter((a) => !currentIds.has(actorIdOnly(a)))
                .filter((a) => {
                  const key = actorKey(a);
                  if (seenPast.has(key)) return false;
                  seenPast.add(key);
                  return true;
                });

              // Pick ONE "lead" actor for the portrait — twins look alike so
              // either works. First-listed wins (stable sortOrder).
              const currentActor = currentActors[0] ?? null;

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
                  ref={(el) => { characterCardRefs.current.set(c.id, el); }}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 scroll-mt-[140px]"
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
                            {/* "originally" reads correctly for both
                                twist-reveals (Khan was originally
                                introduced as John Harrison) and vessel
                                inhabitance (Bravestone is originally
                                Spencer, the consciousness inside).
                                "previously" implied the underlying name
                                was a former identity, which is wrong for
                                possession / avatar premises. */}
                            (originally {c.name})
                          </span>
                        )}
                      </p>
                      {currentActors.length > 0 && (
                        <div className="text-[11px] text-[var(--foreground-muted)]">
                          played by{" "}
                          {currentActors.map((a, i) => (
                            <span key={`${a.actorName}-${i}`}>
                              {a.actorTmdbId ? (
                                <Link href={`/celebrities/${a.actorTmdbId}`} className="text-white hover:text-[var(--ratist-red)] transition-colors font-semibold">
                                  {a.actorName}
                                </Link>
                              ) : (
                                <span className="text-white font-semibold">{a.actorName}</span>
                              )}
                              {/* Suppress notes that just restate what the
                                  alias already says. When the character's
                                  display name has switched to an alias
                                  (Bravestone), a note like "in Bravestone's
                                  avatar" reads as redundant noise. Notes
                                  still render on multi-actor cases without
                                  aliases (Murph's "young" / "adult" /
                                  "elderly"). */}
                              {a.note && !hasAliasReveal && <span className="text-[var(--foreground-muted)]/70"> ({a.note})</span>}
                              {i < currentActors.length - 1 ? <span className="text-[var(--foreground-muted)]/70"> & </span> : null}
                            </span>
                          ))}
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
                    {/* Per-card suggest-edit icon + community-suggestion
                       bubble. Signed-in users can file a structured edit;
                       the community votes inline — auto-applies on
                       threshold, no admin gate. */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isCommunitySourced("character", c.id) && <CommunityBadge compact />}
                      <ItemSuggestions
                        suggestions={[
                          ...suggestionsFor("character", c.id),
                          ...addRelationshipSuggestionsForCharacter(c.id),
                        ]}
                        myVotes={myVotes}
                        mediaType={mediaType}
                        onChanged={onSuggestionChanged}
                        compact
                      />
                      {user && (
                        <button
                          onClick={() => setSuggestDraft({
                            type: "character",
                            id: c.id,
                            data: {
                              name: c.name,
                              baseDescription: c.baseDescription,
                              group: c.group ?? "",
                              actorName: c.actorName ?? "",
                              actorTmdbId: c.actorTmdbId,
                              // Admin-only field; suggest payload omits it.
                              sortOrder: 0,
                              visibleAfter: c.visibleAfter,
                            },
                          })}
                          className="p-1 text-[var(--foreground-muted)]/60 hover:text-[var(--ratist-red)] transition-colors"
                          title="Suggest an edit to this character"
                          aria-label="Suggest an edit to this character"
                        ><Pencil className="w-3 h-3" /></button>
                      )}
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
                     to showing the single role_change as a normal fact.
                     Sort ascending by visibleAfter so the user's eye
                     follows the story chronologically (death at 84:00
                     reads after a confide-scene at 71:22, not before it).
                     Falls back to insertion order via the stable sort
                     when two facts share the same visibleAfter. */}
                  {(() => {
                    const roleCount = visibleFacts.filter((f) => f.factType === "role_change").length;
                    const ladderShown = roleCount >= 2;
                    const baseFacts = ladderShown
                      ? visibleFacts.filter((f) => f.factType !== "role_change")
                      : visibleFacts;
                    const displayFacts = [...baseFacts].sort(
                      (a, b) => compareVisibleAfter(a.visibleAfter, b.visibleAfter, mediaType),
                    );
                    if (displayFacts.length === 0) return null;
                    return (
                      <ul className="mt-2 pt-2 border-t border-[var(--border)]/40 space-y-1.5">
                        {displayFacts.map((f) => (
                          /* Inline label — fact text flows after it and
                             wraps UNDER the label on line 2+, saving vertical
                             space vs the old two-column layout. */
                          <li key={f.id} className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                            <div className="flex items-start gap-1">
                              <span className="flex-1">
                                <span className="text-[9px] uppercase tracking-wider font-semibold mr-1.5" style={{ color }}>
                                  {f.factType.replace(/_/g, " ")}
                                </span>
                                {f.fact}
                              </span>
                              {isCommunitySourced("fact", f.id) && <CommunityBadge compact />}
                              <ItemSuggestions
                                suggestions={suggestionsFor("fact", f.id)}
                                myVotes={myVotes}
                                mediaType={mediaType}
                                onChanged={onSuggestionChanged}
                                compact
                              />
                              {user && (
                                <button
                                  onClick={() => setSuggestDraft({
                                    type: "fact",
                                    id: f.id,
                                    characterId: c.id,
                                    data: { fact: f.fact, factType: f.factType, visibleAfter: f.visibleAfter },
                                  })}
                                  className="opacity-40 hover:opacity-100 hover:text-[var(--ratist-red)] transition shrink-0 mt-0.5"
                                  title="Suggest an edit to this event"
                                  aria-label="Suggest an edit to this event"
                                ><Pencil className="w-2.5 h-2.5" /></button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}

                  {/* Pending "add event" suggestions for THIS character —
                     distinct from the character-level edit bubble at the
                     card top. Only surfaces suggestions whose proposed
                     visibleAfter is ≤ the slider (spoiler gate). */}
                  {(() => {
                    const addFactSugs = addFactSuggestionsForCharacter(c.id);
                    if (addFactSugs.length === 0 && !user) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-[var(--border)]/40 flex items-center flex-wrap gap-2">
                        {user && (
                          <button
                            onClick={() => setSuggestDraft({
                              type: "fact",
                              id: null,
                              characterId: c.id,
                              // Default to the user's current slider position
                              // (not the character's debut) so a viewer
                              // logging "Gerri makes CFO" from S2E1 doesn't
                              // accidentally tag it back at the character's
                              // S1 introduction.
                              data: { fact: "", factType: "other", visibleAfter: position },
                            })}
                            className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Suggest event for {c.name}
                          </button>
                        )}
                        {addFactSugs.length > 0 && (
                          <ItemSuggestions
                            suggestions={addFactSugs}
                            myVotes={myVotes}
                            mediaType={mediaType}
                            onChanged={onSuggestionChanged}
                            compact
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
                </React.Fragment>
              );
            })}
            {/* Pending "new character" suggestions tile — sits at the bottom
               of the cast grid as a red placeholder card. Tap to expand the
               full list of community-proposed characters with vote controls.
               Once one of them clears the approve threshold it leaves the
               group and renders as a real character card; the others stay
               grouped here until they resolve. */}
            {sectionAddSuggestions("character").length > 0 && (
              <PendingCharacterAdds
                suggestions={sectionAddSuggestions("character")}
                myVotes={myVotes}
                mediaType={mediaType}
                onChanged={onSuggestionChanged}
              />
            )}
          </div>
          {user && (
            <button
              onClick={() => setSuggestDraft({
                type: "character",
                // For "add character" we have no existing id; pass a sentinel
                // empty string and let the modal render as add-mode. The
                // suggestion endpoint writes it as action=add.
                id: "",
                data: {
                  name: "",
                  baseDescription: "",
                  group: "",
                  actorName: "",
                  actorTmdbId: null,
                  // sortOrder is admin-only; the suggest payload ignores it.
                  // Pass 0 just to satisfy the draft shape.
                  sortOrder: 0,
                  // Default to the user's current slider position so the
                  // suggested character starts unlocked here. Editable in the
                  // form for any user who actually knows the earlier debut.
                  visibleAfter: position,
                },
              })}
              className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
            ><Plus className="w-3.5 h-3.5" /> Suggest a new character</button>
          )}
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
          count={filteredTimeline.length}
        >
          {/* Character filter row — multi-select with AND semantics so the
             user can pick one character ("just Tyrion's beats") or
             multiple ("scenes Tyrion and Bronn shared"). Only renders
             characters who actually appear in at least one currently-
             visible timeline event so the pill row stays useful even on
             a large cast. Hidden when there's at most one option. */}
          {timelineFilterOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={timelineCharFilter.length === 0}
                onClick={() => setTimelineCharFilter([])}
              >
                All ({visibleTimeline.length})
              </FilterPill>
              {timelineFilterOptions.map((c) => {
                const active = timelineCharFilter.includes(c.id);
                const count = visibleTimeline.filter((t) => t.characterIds.includes(c.id)).length;
                return (
                  <FilterPill
                    key={c.id}
                    active={active}
                    onClick={() => setTimelineCharFilter((prev) =>
                      prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    )}
                  >
                    {c.name} ({count})
                  </FilterPill>
                );
              })}
            </div>
          )}
          {filteredTimeline.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] italic text-center py-6">
              No timeline events match the selected character{timelineCharFilter.length === 1 ? "" : "s"}.
            </p>
          ) : (
          <ol className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/40">
            {filteredTimeline.map((t) => {
              // Resolve character chips against characterById so a chip
              // can still render for characters that are tagged here but
              // unlocked for the slider via a later first-appearance —
              // the user shouldn't see a phantom chip for a character not
              // yet visible in the cast tab. Filter to visibleCharIds.
              const chipChars = t.characterIds
                .map((id) => characterById.get(id))
                .filter((c): c is Character => !!c && visibleCharIds.has(c.id));
              // Parse ((Name)) markers in the description into clickable
              // pills inline. Track which character ids the inline parse
              // covered so any tagged characters that aren't mentioned
              // by name in the text (legacy data, or a typo) still get
              // a fallback chip below the description.
              const parts: React.ReactNode[] = [];
              const referenced = new Set<string>();
              // Allow ONE level of nested parens inside the marker so
              // character names with paren-suffixed disambiguators —
              // e.g. "Nick (Future)" — render correctly when wrapped:
              // ((Nick (Future))). Two-level nesting isn't supported,
              // but no character name uses that.
              const tagRe = /\(\(((?:[^()]|\([^()]*\))*)\)\)/g;
              let lastIdx = 0;
              let pkey = 0;
              let mr: RegExpExecArray | null;
              while ((mr = tagRe.exec(t.description)) !== null) {
                if (mr.index > lastIdx) {
                  parts.push(<React.Fragment key={pkey++}>{t.description.slice(lastIdx, mr.index)}</React.Fragment>);
                }
                const tagName = mr[1];
                const tagged = characterByName.get(tagName);
                if (tagged && visibleCharIds.has(tagged.id)) {
                  referenced.add(tagged.id);
                  parts.push(
                    <button
                      key={pkey++}
                      type="button"
                      onClick={() => scrollToCharacter(tagged.id)}
                      className="inline-flex items-baseline px-1.5 py-0 mx-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]/60 text-[var(--ratist-red)] hover:bg-[var(--surface)] hover:border-[var(--ratist-red)]/60 transition-colors text-[12px] font-medium align-baseline"
                    >
                      {tagName}
                    </button>
                  );
                } else {
                  // Unknown name (typo, alias, or character locked behind
                  // a later visibleAfter than the slider). Render the raw
                  // name as plain text so the description still reads.
                  parts.push(<React.Fragment key={pkey++}>{tagName}</React.Fragment>);
                }
                lastIdx = mr.index + mr[0].length;
              }
              if (lastIdx < t.description.length) {
                parts.push(<React.Fragment key={pkey++}>{t.description.slice(lastIdx)}</React.Fragment>);
              }
              const uncoveredChips = chipChars.filter((c) => !referenced.has(c.id));
              return (
              <li
                key={t.id}
                ref={(el) => { timelineEventRefs.current.set(t.id, el); }}
                className="px-3 py-2 text-sm flex items-start gap-3 scroll-mt-[140px]"
              >
                <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider shrink-0 mt-0.5 w-14">
                  {formatVisibleAfter(t.visibleAfter, mediaType)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white leading-relaxed">{parts}</p>
                  {uncoveredChips.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {uncoveredChips.map((cc) => (
                        <button
                          key={cc.id}
                          type="button"
                          onClick={() => scrollToCharacter(cc.id)}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)]/60 transition-colors text-[10px] text-[var(--foreground-muted)] hover:text-white"
                          title={`Jump to ${cc.name}`}
                        >
                          {cc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isCommunitySourced("timeline", t.id) && <CommunityBadge compact />}
                <ItemSuggestions
                  suggestions={suggestionsFor("timeline", t.id)}
                  myVotes={myVotes}
                  mediaType={mediaType}
                  onChanged={onSuggestionChanged}
                  compact
                />
                {user && (
                  <button
                    onClick={() => setSuggestDraft({
                      type: "timeline",
                      id: t.id,
                      companionId: data.id,
                      seasonNumber: t.seasonNumber,
                      data: {
                        description: t.description,
                        importance: t.importance,
                        characterIds: t.characterIds,
                        visibleAfter: t.visibleAfter,
                      },
                    })}
                    className="opacity-40 hover:opacity-100 hover:text-[var(--ratist-red)] transition shrink-0 mt-0.5"
                    title="Suggest an edit to this timeline event"
                    aria-label="Suggest an edit to this timeline event"
                  ><Pencil className="w-3 h-3" /></button>
                )}
              </li>
              );
            })}
          </ol>
          )}

          {/* Swim-lane visualization. One lane per character with at least
             one visible event; pins at each event timestamp colored by
             the character's group/faction so the chart reads like the
             cast tab. Tap a pin to scroll-and-flash the matching <li>
             above. The vertical line is the user's current slider
             position so they see "I'm here" relative to the season.
             Filter-respecting: events that don't match the active
             character filter render as dim pins instead of disappearing,
             preserving plot density at a glance. Hidden when there are
             fewer than 2 lanes (a single lane wouldn't tell the user
             anything the list doesn't). Sits BELOW the list so the
             reader scans events first, then uses the chart for an
             overview / quick navigation. */}
          {timelineLanes && timelineLanes.lanes.length >= 2 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mt-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold mb-2">
                Character timelines · tap a pin to jump
              </p>
              <div className="space-y-1.5">
                {timelineLanes.lanes.map(({ character, events }) => {
                  // Group/faction color from the same palette that drives
                  // the cast cards' left border so the chart stays
                  // visually consistent with the rest of the viewer.
                  const laneColor = character.group
                    ? (groupColors.get(character.group) ?? GROUP_COLORS[0])
                    : GROUP_COLORS[0];
                  return (
                  <div key={character.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollToCharacter(character.id)}
                      className="text-[10px] text-[var(--foreground-muted)] hover:text-white shrink-0 truncate text-left w-20 flex items-center gap-1"
                      title={`Jump to ${character.name}`}
                    >
                      <span
                        className="inline-block w-1 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: laneColor }}
                        aria-hidden
                      />
                      <span className="truncate">{character.name}</span>
                    </button>
                    <div className="relative flex-1 h-3 bg-[var(--surface-2)] rounded">
                      <div
                        className="absolute top-0 bottom-0 w-px bg-[var(--ratist-red)]/40 pointer-events-none"
                        style={{ left: `${timelineLanes.currentFraction * 100}%` }}
                        aria-hidden
                      />
                      {events.map(({ event, fraction, included }) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => scrollToTimelineEvent(event.id)}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-all hover:scale-150"
                          style={{
                            left: `${fraction * 100}%`,
                            backgroundColor: laneColor,
                            opacity: included ? 1 : 0.25,
                          }}
                          title={`${formatVisibleAfter(event.visibleAfter, mediaType)} — ${event.description.replace(/\(\(((?:[^()]|\([^()]*\))*)\)\)/g, "$1").slice(0, 80)}`}
                          aria-label={`Jump to event: ${event.description.replace(/\(\(((?:[^()]|\([^()]*\))*)\)\)/g, "$1").slice(0, 80)}`}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="shrink-0 w-20" aria-hidden />
                <div className="flex-1 flex justify-between text-[9px] text-[var(--foreground-muted)]">
                  <span>{timelineLanes.startLabel}</span>
                  <span>{timelineLanes.midLabel}</span>
                  <span>{timelineLanes.endLabel}</span>
                </div>
              </div>
            </div>
          )}

          {sectionAddSuggestions("timeline").length > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-[var(--surface-2)]/40 border border-[var(--ratist-red)]/20 rounded-lg px-3 py-2 text-[11px] text-[var(--foreground-muted)]">
              <span>Community-proposed timeline events:</span>
              <ItemSuggestions
                suggestions={sectionAddSuggestions("timeline")}
                myVotes={myVotes}
                mediaType={mediaType}
                onChanged={onSuggestionChanged}
              />
            </div>
          )}
          {user && (
            <button
              onClick={() => setSuggestDraft({
                type: "timeline",
                id: null,
                companionId: data.id,
                seasonNumber: mediaType === "tv" ? selectedSeason : null,
                // Pre-fill with the user's current slider position so the
                // proposed event lines up with where they are in the watch.
                data: { description: "", importance: 3, characterIds: [], visibleAfter: position },
              })}
              className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
            ><Plus className="w-3.5 h-3.5" /> Suggest a new timeline event</button>
          )}
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
                  <div key={g.id} className="px-3 py-2 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <dt className="text-sm font-semibold text-white flex items-baseline gap-2">
                        {g.term}
                        {g.category && <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{g.category}</span>}
                      </dt>
                      <dd className="text-sm text-[var(--foreground-muted)] mt-0.5 leading-relaxed">{g.definition}</dd>
                    </div>
                    <div className="flex items-start gap-1 shrink-0 mt-1">
                      {isCommunitySourced("glossary", g.id) && <CommunityBadge compact />}
                      <ItemSuggestions
                        suggestions={suggestionsFor("glossary", g.id)}
                        myVotes={myVotes}
                        mediaType={mediaType}
                        onChanged={onSuggestionChanged}
                        compact
                      />
                      {user && (
                        <button
                          onClick={() => setSuggestDraft({
                            type: "glossary",
                            id: g.id,
                            companionId: data.id,
                            seasonNumber: g.seasonNumber,
                            data: {
                              term: g.term,
                              definition: g.definition,
                              category: g.category ?? "",
                              visibleAfter: g.visibleAfter,
                            },
                          })}
                          className="opacity-40 hover:opacity-100 hover:text-[var(--ratist-red)] transition"
                          title="Suggest an edit to this glossary term"
                          aria-label="Suggest an edit to this glossary term"
                        ><Pencil className="w-3 h-3" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)] italic text-center py-4">No terms in this category yet.</p>
            )}
            {sectionAddSuggestions("glossary").length > 0 && (
              <div className="mt-3 flex items-center gap-2 bg-[var(--surface-2)]/40 border border-[var(--ratist-red)]/20 rounded-lg px-3 py-2 text-[11px] text-[var(--foreground-muted)]">
                <span>Community-proposed glossary terms:</span>
                <ItemSuggestions
                  suggestions={sectionAddSuggestions("glossary")}
                  myVotes={myVotes}
                  mediaType={mediaType}
                  onChanged={onSuggestionChanged}
                />
              </div>
            )}
            {user && (
              <button
                onClick={() => setSuggestDraft({
                  type: "glossary",
                  id: null,
                  companionId: data.id,
                  seasonNumber: mediaType === "tv" ? selectedSeason : null,
                  // Default to current slider position so the term unlocks
                  // for other viewers at the same beat the suggester first
                  // encountered it.
                  data: { term: "", definition: "", category: "", visibleAfter: position },
                })}
                className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
              ><Plus className="w-3.5 h-3.5" /> Suggest a new glossary term</button>
            )}
            {COMPANION_AD_SLOT && <AdUnit slot={COMPANION_AD_SLOT} format="auto" className="mt-4" />}
          </Section>
        );
      })()}

      {/* Recap tab — gated behind a reveal button because the prose
         contains full spoilers for every prior installment AND the
         current one. Movies show stacked franchise entries oldest-
         first; TV stacks each season's prose from S1 up to whichever
         season the user is currently viewing. */}
      {seasonIsGenerated && activeTab === "recap" && (() => {
        // Resolve the active recap pair — one slot per page. Movies
        // have a single { installment, series }; TV picks the slot for
        // the currently-viewed season. The series block is null for
        // first installments (S1, standalone movies) and we hide that
        // section entirely rather than rendering an empty card.
        const slot = mediaType === "movie"
          ? data.recaps?.movie ?? null
          : data.recaps?.bySeason?.[String(selectedSeason)] ?? null;
        if (!slot || (!slot.installment && !slot.series)) {
          return (
            <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">
              No recap available yet for this {mediaType === "movie" ? "movie" : "season"}. Regenerate to add one.
            </p>
          );
        }
        const installmentLabel = mediaType === "movie"
          ? data.title
          : `Season ${selectedSeason}`;
        const seriesLabel = mediaType === "movie"
          ? `${data.title.split(":")[0].trim()} series`
          : `${data.title} — through Season ${selectedSeason}`;
        return (
          <div className="space-y-4">
            {!recapRevealed ? (
              <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-5 text-center space-y-3">
                <div className="inline-flex items-center justify-center gap-2 text-[var(--ratist-red)]">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Spoiler-heavy recap</span>
                </div>
                <p className="text-sm text-white leading-relaxed">
                  {slot.series
                    ? mediaType === "movie"
                      ? `Recap of ${data.title} plus a series-wide recap covering every prior film in the franchise — spoilers and all.`
                      : `Recap of Season ${selectedSeason} plus a series-wide recap covering every season through this one — spoilers and all.`
                    : mediaType === "movie"
                      ? `Full plot recap of ${data.title} — spoilers and all.`
                      : `Full plot recap of Season ${selectedSeason} — spoilers and all.`}
                  {" "}It&apos;s designed for refreshing your memory before a new installment, not for first-time viewers.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRecapRevealed(true);
                    track("companion_recap_reveal", { companion_id: data.id });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
                >
                  <ScrollText className="w-4 h-4" /> Reveal recap
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setRecapRevealed(false)}
                    className="inline-flex items-center gap-1.5 text-[10px] text-[var(--foreground-muted)] hover:text-white"
                  >
                    <EyeOff className="w-3 h-3" /> Hide recap
                  </button>
                </div>
                {slot.installment && (
                  <article className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <header className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold mb-0.5">This installment</p>
                      <h3 className="text-base font-semibold text-white">{installmentLabel}</h3>
                    </header>
                    <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap">{slot.installment}</p>
                  </article>
                )}
                {slot.series && (
                  <article className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-4">
                    <header className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold mb-0.5">Series so far</p>
                      <h3 className="text-base font-semibold text-white">{seriesLabel}</h3>
                    </header>
                    <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap">{slot.series}</p>
                  </article>
                )}
              </>
            )}
          </div>
        );
      })()}

      {suggestionJustSent && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-xs text-green-300">
          Thanks! Your suggestion is live — the community can now vote on it.
        </div>
      )}

      {/* Shared editor, suggest-mode. Available only to signed-in users. */}
      <CompanionItemEditor
        open={!!suggestDraft && !!user}
        draft={suggestDraft}
        mediaType={mediaType}
        characters={data.characters.map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setSuggestDraft(null)}
        onSaved={() => {
          setSuggestionJustSent(true);
          setTimeout(() => setSuggestionJustSent(false), 4000);
          fetchSuggestions();
        }}
        getToken={getSuggestToken}
        mode="suggest"
        companionId={data.id}
      />
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

/**
 * Pending "new character" suggestions tile. Shaped like a character card so
 * it sits naturally at the bottom of the cast grid, but with red theming
 * to read as a placeholder. Tap to expand the full vote panel — one tile
 * groups every pending add-character suggestion, mirroring how add-event /
 * add-glossary suggestions stack into a single bubble per section.
 *
 * Once an individual suggestion clears the approve threshold it leaves the
 * pending list (community-apply path) and renders as a real character card
 * elsewhere; the others stay grouped here until they resolve.
 */
function PendingCharacterAdds({
  suggestions, myVotes, mediaType, onChanged,
}: {
  suggestions: SuggestionRow[];
  myVotes: Record<string, number>;
  mediaType: "movie" | "tv";
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (suggestions.length === 0) return null;
  return (
    <div
      className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-3"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--ratist-red)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <div className="w-12 h-12 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 flex items-center justify-center shrink-0">
          <Plus className="w-5 h-5 text-[var(--ratist-red)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--ratist-red)]">
            {suggestions.length} community-proposed character{suggestions.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
            Tap to vote — characters appear in the cast list once approved.
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[var(--foreground-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]/40 space-y-2">
          {suggestions.map((s) => (
            <PendingCharacterRow
              key={s.id}
              suggestion={s}
              myVote={myVotes[s.id] ?? 0}
              mediaType={mediaType}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One pending add-character suggestion rendered in expanded form. Mirrors
// ItemSuggestions' SuggestionRowDisplay layout (vote stack on the right,
// payload + rationale on the left) but trimmed to what's relevant for new
// characters. Reused only by PendingCharacterAdds — kept inline here to
// avoid plumbing extra props through ItemSuggestions.
function PendingCharacterRow({
  suggestion, myVote, mediaType, onChanged,
}: {
  suggestion: SuggestionRow;
  myVote: number;
  mediaType: "movie" | "tv";
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [voting, setVoting] = useState<null | 1 | -1 | 0>(null);
  async function vote(next: 1 | -1) {
    if (!user) return;
    const target = myVote === next ? 0 : next;
    setVoting(target);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watch-companion/suggestions/${suggestion.id}/vote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vote: target }),
      });
      if (res.ok) onChanged();
    } finally {
      setVoting(null);
    }
  }
  const p = (suggestion.payload ?? {}) as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name : "(unnamed)";
  const description = typeof p.baseDescription === "string" ? p.baseDescription : "";
  const actorName = typeof p.actorName === "string" && p.actorName.length > 0 ? p.actorName : null;
  const va = (p.visibleAfter ?? {}) as { seconds?: number; season?: number; episode?: number };
  const visibleAt = mediaType === "movie"
    ? (typeof va.seconds === "number" ? formatMovieTime(va.seconds) : null)
    : (typeof va.season === "number" || typeof va.episode === "number" ? `S${va.season ?? "?"}E${va.episode ?? "?"}` : null);
  return (
    <div className="bg-[var(--surface-2)]/40 border border-[var(--border)]/60 rounded-lg p-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{name}</p>
        {actorName && (
          <p className="text-[11px] text-[var(--foreground-muted)]">played by <span className="text-white">{actorName}</span></p>
        )}
        {description && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1 leading-relaxed">{description}</p>
        )}
        {visibleAt && (
          <p className="text-[10px] text-[var(--foreground-muted)]/70 uppercase tracking-wider mt-1">unlocks at {visibleAt}</p>
        )}
        {suggestion.rationale && (
          <p className="text-[10px] text-[var(--foreground-muted)] italic mt-1">&ldquo;{suggestion.rationale}&rdquo;</p>
        )}
        <p className="text-[9px] text-[var(--foreground-muted)]/70 mt-1">by {suggestion.submitter.name}</p>
      </div>
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          onClick={() => vote(1)}
          disabled={!user || voting !== null}
          className={`p-1 rounded transition-colors ${myVote === 1 ? "text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"} disabled:opacity-30`}
          aria-label="Upvote"
        >
          {voting === 1 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
        </button>
        <span className={`text-[11px] font-bold tabular-nums ${suggestion.upvoteScore > 0 ? "text-green-400" : suggestion.upvoteScore < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
          {suggestion.upvoteScore > 0 ? "+" : ""}{suggestion.upvoteScore}
        </span>
        <button
          onClick={() => vote(-1)}
          disabled={!user || voting !== null}
          className={`p-1 rounded transition-colors ${myVote === -1 ? "text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400"} disabled:opacity-30`}
          aria-label="Downvote"
        >
          {voting === -1 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
