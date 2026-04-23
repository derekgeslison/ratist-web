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

export interface DraftCharacter {
  name: string;
  actorName: string | null;
  actorTmdbId: number | null;
  baseDescription: string;
  group: string | null;
  visibleAfter: VisibleAfter;
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
// group cleanly and the UI stays gender-agnostic.
const LABEL_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\b(half[ -]?)(brothers?|sisters?)\b/gi, "$1siblings"],
  [/\bbrothers?\s+of\b/gi, "sibling of"],
  [/\bsisters?\s+of\b/gi, "sibling of"],
  [/\bbrothers?\b/gi, "siblings"],
  [/\bsisters?\b/gi, "siblings"],
  [/\bfathers?\s+of\b/gi, "parent of"],
  [/\bmothers?\s+of\b/gi, "parent of"],
  [/\b(sons?|daughters?)\s+of\b/gi, "child of"],
  [/\bex[ -]?(husbands?|wives?)\b/gi, "ex-spouse"],
  [/\b(husbands?|wives?)\b/gi, "spouse"],
  [/\bex[ -]?(boyfriends?|girlfriends?)\b/gi, "ex-partner"],
  [/\b(boyfriends?|girlfriends?)\b/gi, "partner"],
];

export function normalizeLabel(label: string): string {
  let out = label.trim();
  out = out.replace(/\bhalf[ ]?(siblings?|brothers?|sisters?)\b/gi, (_m, tail: string) => `half-${tail.toLowerCase()}`);
  for (const [re, replacement] of LABEL_NORMALIZATIONS) {
    out = out.replace(re, replacement);
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
}): string {
  const opts = { includeCast: true, includeSeasonEpisodes: true, includeWikipediaEpisodes: true, ...options };
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
  return sections.join("\n");
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
