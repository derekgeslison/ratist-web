// Shared types, enums, schema fragments, and normalizers for Watch Companion
// chunked generation. Each chunk (characters, facts, relationships, timeline,
// glossary) imports what it needs from here.

import Anthropic from "@anthropic-ai/sdk";

export const FACT_TYPES = ["role_change", "relationship_change", "arc", "death", "reveal", "other"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const RELATIONSHIP_TYPES = ["family", "romantic", "business", "rivalry", "alliance", "mentor", "other"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const GLOSSARY_CATEGORIES = ["world", "faction", "jargon", "concept"] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface VisibleAfter {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

// ── Output shapes (one per chunk) ──────────────────────────────────────────

export interface DraftCharacterActor {
  actorName: string;
  actorTmdbId: number | null;
  note: string | null; // "young", "adult", "elderly", "twin", etc.
  visibleAfter: VisibleAfter;
}

export interface DraftNameAlias {
  name: string;
  visibleAfter: VisibleAfter;
}

export interface DraftGroupChange {
  group: string;
  visibleAfter: VisibleAfter;
}

export interface DraftCharacter {
  name: string;
  // Primary/earliest-visible actor for the character. Kept for backward
  // compatibility — rich multi-actor info lives in `actors` below.
  actorName: string | null;
  actorTmdbId: number | null;
  baseDescription: string;
  group: string | null;
  visibleAfter: VisibleAfter;
  // Multi-actor list for age variants, recasts, twins-as-one-character.
  // When present, the earliest entry (lowest visibleAfter) typically
  // mirrors actorName/actorTmdbId. Empty for single-actor characters.
  actors?: DraftCharacterActor[];
  // Names this character is known by at different points in the story.
  // Used for twist-reveal cases — see the Khan example in the characters
  // prompt. Empty for characters whose name never changes.
  nameAliases?: DraftNameAlias[];
  // Group/faction history for characters who switch sides or have hidden
  // allegiances. Same shape as nameAliases — { group, visibleAfter }.
  // The viewer picks the latest unlocked entry, falling back to `group`.
  // Empty for characters whose faction never changes.
  groupHistory?: DraftGroupChange[];
}

export interface DraftFact {
  characterName: string; // resolved to ID by the orchestrator
  fact: string;
  factType: FactType;
  visibleAfter: VisibleAfter;
}

export interface DraftRelationship {
  fromName: string;
  toName: string;
  relationshipType: RelationshipType;
  label: string;
  visibleAfter: VisibleAfter;
  directed: boolean;
}

export interface DraftTimelineEvent {
  description: string;
  characterNames: string[];
  visibleAfter: VisibleAfter;
  importance: number;
}

export interface DraftGlossaryTerm {
  term: string;
  definition: string;
  category: GlossaryCategory | null;
  visibleAfter: VisibleAfter;
}

export interface CompanionDraft {
  characters: DraftCharacter[];
  facts: DraftFact[];
  relationships: DraftRelationship[];
  timelineEvents: DraftTimelineEvent[];
  glossary: DraftGlossaryTerm[];
}

// ── Shared visibleAfter schema fragment ────────────────────────────────────

export const VISIBLE_AFTER_SCHEMA = {
  type: "object" as const,
  properties: {
    seconds: { type: ["integer", "null"] as const },
    season: { type: ["integer", "null"] as const },
    episode: { type: ["integer", "null"] as const },
  },
  required: ["seconds", "season", "episode"] as const,
  additionalProperties: false as const,
};

// ── Shared normalizers ─────────────────────────────────────────────────────

export function normVisibleAfter(raw: unknown): VisibleAfter {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    seconds: typeof v.seconds === "number" && v.seconds >= 0 ? Math.floor(v.seconds) : null,
    season: typeof v.season === "number" && v.season > 0 ? Math.floor(v.season) : null,
    episode: typeof v.episode === "number" && v.episode > 0 ? Math.floor(v.episode) : null,
  };
}

// Rewrite gendered family/relationship terms to neutral equivalents so pills
// group cleanly and the UI stays gender-agnostic. "Nibling" = gender-neutral
// niece/nephew; lets a patriarch's 3 nephews + 2 nieces show as one pill
// instead of two split pills.
//
// ORDER MATTERS: compound/modifier forms (great-nephew, grand-niece) must
// match BEFORE the plain forms or the plain pattern eats the family word and
// leaves the prefix dangling ("great-" by itself).
type LabelReplacer = string | ((match: string, ...groups: string[]) => string);
const LABEL_NORMALIZATIONS: Array<[RegExp, LabelReplacer]> = [
  // Siblings
  [/\b(half[ -]?)(brothers?|sisters?)\b/gi, "$1siblings"],
  [/\bbrothers?\s+of\b/gi, "sibling of"],
  [/\bsisters?\s+of\b/gi, "sibling of"],
  [/\bbrothers?\b/gi, "siblings"],
  [/\bsisters?\b/gi, "siblings"],
  // Niblings (niece/nephew) — compound modifiers first, then plain.
  // Always output with a hyphen between modifier and "nibling" regardless of
  // whether the input had a space, hyphen, or neither.
  [/\b(great|grand)[ -]?(niece|nephew)\s+of\b/gi, (_m, prefix: string) => `${prefix.toLowerCase()}-nibling of`],
  [/\b(great|grand)[ -]?(nieces|nephews)\b/gi, (_m, prefix: string) => `${prefix.toLowerCase()}-niblings`],
  [/\b(great|grand)[ -]?(niece|nephew)\b/gi, (_m, prefix: string) => `${prefix.toLowerCase()}-nibling`],
  [/\b(niece|nephew)\s+of\b/gi, "nibling of"],
  [/\b(nieces|nephews)\b/gi, "niblings"],
  [/\b(niece|nephew)\b/gi, "nibling"],
  // Parents / children — preserve "of" suffix
  [/\bfathers?\s+of\b/gi, "parent of"],
  [/\bmothers?\s+of\b/gi, "parent of"],
  [/\b(sons?|daughters?)\s+of\b/gi, "child of"],
  // Spouses / partners
  [/\bex[ -]?(husbands?|wives?)\b/gi, "ex-spouse"],
  [/\b(husbands?|wives?)\b/gi, "spouse"],
  [/\bex[ -]?(boyfriends?|girlfriends?)\b/gi, "ex-partner"],
  [/\b(boyfriends?|girlfriends?)\b/gi, "partner"],
];

export function normalizeLabel(label: string): string {
  let out = label.trim();
  out = out.replace(/\bhalf[ ]?(siblings?|brothers?|sisters?)\b/gi, (_m, tail: string) => `half-${tail.toLowerCase()}`);
  for (const [re, replacement] of LABEL_NORMALIZATIONS) {
    // String.prototype.replace accepts either overload; the cast lets us
    // pass a mixed array of string and function replacements.
    out = typeof replacement === "string"
      ? out.replace(re, replacement)
      : out.replace(re, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

// ── Shared Claude helpers ──────────────────────────────────────────────────

/**
 * Common tool-use caller. Each chunk supplies its prompt + tool; this does
 * the Anthropic call + extracts the tool_use block.
 */
export async function callTool<T>(opts: {
  client: Anthropic;
  systemPrompt: string;
  userMessage: string;
  tool: Anthropic.Tool;
  maxTokens?: number;
}): Promise<T> {
  const response = await opts.client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: opts.maxTokens ?? 4096,
    system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.userMessage }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`AI did not return structured output for ${opts.tool.name}`);
  }
  return toolUse.input as T;
}

// ── Shared grounding-to-user-message helper ────────────────────────────────
// Each chunk builds its own user message but they all start with the same
// context block. Extracted to keep them consistent.

import type { CompanionGroundingData } from "../watch-companion-grounding";

export function formatGroundingContext(grounding: CompanionGroundingData, season: number | null, options?: {
  includeCast?: boolean;
  includeSeasonEpisodes?: boolean;
  includeWikipediaEpisodes?: boolean;
  /** Whether to inline the subtitle excerpt (when grounding has one). Chunks
   *  that need timestamp anchors (facts, relationships, timeline, glossary)
   *  should keep this on; the characters chunk defaults it off since actor
   *  identity doesn't benefit from dialogue. */
  includeSubtitles?: boolean;
  /** When set, the prompt frames the gen as an INCREMENTAL UPDATE for one
   *  episode of an actively-airing season. Adds an explicit "GENERATING
   *  EPISODE" line so each chunk's prompt nudges the AI to scope output
   *  to that episode rather than re-emitting season-wide content. */
  episode?: number | null;
}): string {
  const opts = { includeCast: true, includeSeasonEpisodes: true, includeWikipediaEpisodes: true, includeSubtitles: true, ...options };
  const sections: string[] = [];

  sections.push(`TITLE: ${grounding.title}${grounding.year ? ` (${grounding.year})` : ""}`);
  sections.push(`MEDIA TYPE: ${grounding.source}`);
  if (grounding.source === "movie" && grounding.runtimeSeconds) {
    const minutes = Math.round(grounding.runtimeSeconds / 60);
    sections.push(`RUNTIME: ${minutes} minutes (${grounding.runtimeSeconds} seconds)`);
  }
  if (season !== null) {
    sections.push(`GENERATING SEASON: ${season}`);
  }
  if (typeof opts.episode === "number" && opts.episode > 0 && season !== null) {
    sections.push(`GENERATING EPISODE: S${season}E${opts.episode} (incremental update — append-only)`);
  }
  if (grounding.overview) {
    sections.push(`\nTMDB OVERVIEW:\n${grounding.overview}`);
  }
  if (grounding.wikipedia) {
    sections.push(`\nWIKIPEDIA SUMMARY (${grounding.wikipedia.url}):\n${grounding.wikipedia.extract}`);
  }
  if (opts.includeCast && grounding.cast.length > 0) {
    const castLines = grounding.cast.slice(0, 30)
      .map((c) => `- ${c.name} as ${c.character || "(unknown role)"} [actor tmdbId: ${c.tmdbId}]`)
      .join("\n");
    sections.push(`\nCAST (top ${Math.min(30, grounding.cast.length)} from TMDB — use actorTmdbId values exactly):\n${castLines}`);
  }
  if (grounding.source === "tv" && grounding.seasons && opts.includeSeasonEpisodes) {
    const seasonSummary = grounding.seasons
      .map((s) => `- S${s.seasonNumber}: ${s.episodeCount} episodes${s.overview ? ` — ${s.overview.slice(0, 200)}` : ""}`)
      .join("\n");
    sections.push(`\nALL SEASONS (for context):\n${seasonSummary}`);
    if (season !== null) {
      const target = grounding.seasons.find((s) => s.seasonNumber === season);
      if (target && target.episodes.length > 0) {
        const epLines = target.episodes
          .map((e) => `- S${season}E${e.episodeNumber} "${e.name}": ${(e.overview ?? "(no summary)").slice(0, 500)}`)
          .join("\n");
        sections.push(`\nSEASON ${season} EPISODES:\n${epLines}`);
      }
    }
  }
  if (opts.includeWikipediaEpisodes && grounding.wikipediaEpisodes) {
    sections.push(`\nWIKIPEDIA EPISODE CONTEXT:\n${grounding.wikipediaEpisodes.slice(0, 4000)}`);
  }
  if (opts.includeSubtitles && grounding.subtitleExcerpts && grounding.subtitleExcerpts.length > 0) {
    // Real dialogue with timestamps. Massively improves visibleAfter accuracy
    // because the AI can see WHEN a line is spoken instead of guessing act
    // boundaries. For TV, every episode in the target season gets its own
    // labeled block — the [M:SS] timestamps are seconds-within-episode,
    // not absolute, so the AI must compose visibleAfter as
    // { season, episode, seconds } for the matching block.
    const blocks = grounding.subtitleExcerpts
      .map((e) => `--- ${e.label} ---\n${e.cues}`)
      .join("\n\n");
    const header = grounding.subtitleExcerpts.length === 1
      ? `\nDIALOGUE EXCERPT (${grounding.subtitleExcerpts[0].label}) — sampled timestamped dialogue from the English subtitle file. Use these timestamps to anchor visibleAfter.seconds values when a reveal/beat happens on-screen.`
      : `\nDIALOGUE EXCERPTS (${grounding.subtitleExcerpts.length} episodes) — sampled timestamped dialogue from the English subtitle file for each episode in the target season. Each block's [M:SS] timestamps are seconds WITHIN THAT EPISODE — when anchoring visibleAfter for TV, set season + episode to match the block, and seconds to the timestamp.`;
    sections.push(`${header}\n\n${blocks}`);
  }
  return sections.join("\n");
}

// ── Prior-season canon (for continuity when generating S2+) ────────────────
// When we draft season N>1, we pass what's already been canonicalized from
// earlier seasons into each chunk's user message. This keeps character
// wording, relationship labels, and glossary phrasing consistent across
// seasons — and typically reduces hallucination because Sonnet anchors on
// the established names instead of re-deriving them.

export interface PriorSeasonCanon {
  characters: Array<{ name: string; baseDescription: string; group: string | null }>;
  relationships: Array<{ fromName: string; toName: string; label: string; relationshipType: string }>;
  glossary: Array<{ term: string; definition: string }>;
}

export function formatPriorSeasonCanon(canon: PriorSeasonCanon | null): string {
  if (!canon) return "";
  if (canon.characters.length === 0 && canon.relationships.length === 0 && canon.glossary.length === 0) return "";

  const parts: string[] = [];
  parts.push("\n## CANON FROM PRIOR SEASONS — reuse these exact names, labels, and wording for continuity\n");
  parts.push("The following content was drafted + admin-reviewed for earlier seasons of this show. For any character, relationship, or glossary term that persists into the season you're drafting now, REUSE THE EXACT NAME AND LABEL shown here. Do not paraphrase or relabel. Only introduce new content or evolutions.\n");

  if (canon.characters.length > 0) {
    const lines = canon.characters.map((c) => `- ${c.name}${c.group ? ` [${c.group}]` : ""}: ${c.baseDescription}`).join("\n");
    parts.push(`\n### Established characters\n${lines}`);
  }
  if (canon.relationships.length > 0) {
    const lines = canon.relationships.map((r) => `- ${r.fromName} — ${r.label} — ${r.toName} (${r.relationshipType})`).join("\n");
    parts.push(`\n### Established relationships (keep these labels word-for-word if the relationship still applies)\n${lines}`);
  }
  if (canon.glossary.length > 0) {
    const lines = canon.glossary.map((g) => `- ${g.term}: ${g.definition}`).join("\n");
    parts.push(`\n### Established glossary terms\n${lines}`);
  }

  return parts.join("\n");
}

// ── Episode-mode addendum (incremental update for actively-airing seasons) ─
// When generating a single episode's worth of new content for a season
// already partway through generation, every chunk's user message includes
// this block. It tells the AI two things: (1) the canon already includes
// content from earlier episodes in this same season, so don't re-emit
// items that are already there; (2) every visibleAfter must point at this
// episode or later — anything earlier should already exist in the canon
// list and re-emitting it would create duplicates.
export function formatEpisodeModeAddendum(season: number, episode: number, kind: "characters" | "facts" | "relationships" | "timeline" | "glossary"): string {
  const itemNoun = {
    characters: "character",
    facts: "fact",
    relationships: "relationship",
    timeline: "timeline event",
    glossary: "glossary term",
  }[kind];
  return `\n\n## INCREMENTAL UPDATE — S${season}E${episode} ONLY\n\nThis season is in airing status — earlier episodes (S${season}E1..S${season}E${episode - 1}) have ALREADY been generated and persisted. The "CANON FROM PRIOR SEASONS" block above includes both prior seasons AND earlier episodes of the current season — anything listed there ALREADY EXISTS in our database.\n\n- Do NOT re-emit any ${itemNoun} already in the canon list. Skip them entirely; they're already saved.\n- ONLY emit ${itemNoun}s that become audience-known AT or AFTER S${season}E${episode}.\n- Every visibleAfter you emit MUST be { season: ${season}, episode: ${episode}, ... } or later. Earlier visibleAfter values are forbidden — those items would already be in our DB.\n- If S${season}E${episode} introduces nothing new for your section, emit an empty list. That's fine — not every episode introduces new ${itemNoun}s.`;
}

// ── Shared visibleAfter guidance (inserted into each chunk's prompt) ───────

export const VISIBLE_AFTER_GUIDANCE = `
## Spoiler gating with visibleAfter

EVERY item you emit has a "visibleAfter" marker saying when the viewer first learns it. Get this wrong and the feature ruins shows.

For MOVIES: { seconds: N } — seconds into the film. Use 0 for opening-scene info, runtime's ~30% for end-of-act-1 reveals, ~70% for end-of-act-2, ~90% for act-3 twists. Err LATE.

For TV SHOWS: { season: S, episode: E, seconds?: N } — the first episode (and optionally seconds into it) when the info is revealed.
- A character who doesn't appear until S1E3 gets { season: 1, episode: 3 } — NOT episode 1. Err LATE.
- For seconds: ~0 for cold-open, ~600 (10 min) mid-early, ~1200 (20 min) act 2 turn, ~2400 (40 min) act 3 for hour-longs. Half-hour comedies halve these.
- If unsure about seconds, omit — the intra-episode slider treats omitted seconds as "start of episode".

NEVER tag earlier than when info is established. When in doubt, tag LATER.
`;
