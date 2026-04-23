import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";
import type { CompanionGroundingData } from "./watch-companion-grounding";

// ─── Types returned from Claude (pre-persistence) ───────────────────────────
// Characters are referenced by display name elsewhere in the payload; we
// resolve names to IDs after saving characters first.

const FACT_TYPES = ["role_change", "relationship_change", "arc", "death", "reveal", "other"] as const;
export type FactType = (typeof FACT_TYPES)[number];

const RELATIONSHIP_TYPES = ["family", "romantic", "business", "rivalry", "alliance", "mentor", "other"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const GLOSSARY_CATEGORIES = ["world", "faction", "jargon", "concept"] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface VisibleAfter {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

export interface DraftCharacterFact {
  fact: string;
  factType: FactType;
  visibleAfter: VisibleAfter;
}

export interface DraftCharacter {
  name: string;
  actorName: string | null;
  actorTmdbId: number | null;
  baseDescription: string;
  group: string | null;
  visibleAfter: VisibleAfter;
  facts: DraftCharacterFact[];
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
  relationships: DraftRelationship[];
  timelineEvents: DraftTimelineEvent[];
  glossary: DraftGlossaryTerm[];
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are helping an admin draft a "Watch Companion" for a movie or TV show on The Ratist — a mobile-first reference card a viewer opens WHILE watching. The companion answers questions like "wait, who is that character?" or "what was the name of that faction?" without spoiling anything the viewer hasn't seen yet.

Your output is a STRUCTURED FIRST DRAFT. An admin will review, edit, and publish it. Accuracy matters more than coverage.

## Spoiler gating — the most important thing to get right

EVERY item you emit (character, fact, relationship, timeline beat, glossary term) has a "visibleAfter" marker that says "this is only shown to viewers who have watched up to this point." Get this wrong and the feature ruins shows for users.

For MOVIES, visibleAfter is:
- { seconds: N } — the number of seconds into the film when this information is first clearly established.
- Use 0 for setup elements the viewer knows from the opening.
- Use the runtime's ~30% mark for end-of-act-1 reveals, ~70% for end-of-act-2 reveals, ~90% for act-3 twists.
- Err on the side of AFTER the reveal. Being too late is never a problem; being too early is.

For TV SHOWS, visibleAfter is:
- { season: S, episode: E, seconds?: number } — the first episode AND (when confidently estimable) the approximate number of seconds into that episode when the information is revealed.
- Prefer emitting seconds at **act boundaries**: ~0 for cold-open reveals, ~600 (10 min) for mid-early, ~1200 (20 min) for act 2 turn, ~1800 (30 min) for end-act-2, ~2400 (40 min) for act 3 for hour-long episodes. For half-hour comedies halve these. A mid-season finale cliffhanger sits at near the episode's runtime.
- If unsure, tag with just season + episode (no seconds) — the viewer's intra-episode slider will treat that as "start of episode" so they see it as soon as the episode begins.
- A character introduction usually belongs at their first scene — tag { season: 1, episode: 1, seconds: 0 } if they're in the cold open, higher if they show up later.
- A twist revealed in the last scene of the S3 finale gets { season: 3, episode: [finale], seconds: [near runtime] }.

NEVER output a fact tagged earlier than when it's established. If you're unsure, tag it later.

## Characters

- 8–20 characters, focused on recurring + named roles. Skip one-scene cameos unless essential.
- "baseDescription" describes the CHARACTER'S IDENTITY — who they are as a person in the story's world — NOT their title or current role. It should remain accurate for the entire run. Examples:
  - GOOD: "A longtime Waystar executive and Logan's financial strategist. Loyal but increasingly cynical." — describes who Karl IS, stays true whether he's CFO, COO, or ousted.
  - BAD: "CFO of Waystar Royco" — this gets stale when the role changes in later seasons.
  - GOOD: "The Roy family's outsider son-in-law. Pragmatic, self-serving, an anxious social climber." — Tom at any point in the series.
  - BAD: "Shiv's husband and head of the news division" — both facts change.
- Roles, titles, positions, and allegiances evolve — those go in **facts** with visibleAfter tags, NOT baseDescription.
- "actorName" and "actorTmdbId" MUST match someone in the provided cast list exactly.
- "group" is their faction / house / family / team — used for color-coding diagrams. Leave null if not applicable.
- "visibleAfter" = when they first appear on-screen.
- "facts" are EVOLVING traits that unlock as the story progresses. 0–8 per character — **be generous when a character's role or standing shifts multiple times**. Each fact has its own visibleAfter.
  - factType: "role_change" (promotion/demotion/title switch — use liberally whenever someone's job or position changes), "relationship_change" (new marriage, break-up, alliance shift), "arc" (major character evolution), "death" (permanent exit), "reveal" (something recontextualizes them), "other".
  - For a character whose title changes 3 times across a season, emit 3 separate role_change facts tagged at each switch point. Don't collapse them into the baseDescription.

## Relationships

- Directed (A → B) or symmetric (siblings, spouses, allies).
- 5–30 total. Skip obvious ones (child of obvious parent). Surface non-obvious ones (ex-spouse, mentor, business rival).
- "label" is short, modern, plainspoken human-readable English: "father of", "ex-wife", "reports to", "rival", "best friend", "past affair with", "business contact", "former lover". **Avoid archaic wording** like "paramour", "beau", "suitor" — write the way a viewer would describe the relationship to a friend.
- **Multiple relationships between the same two characters are fine and encouraged when warranted.** A character who is both a past lover AND a current political contact gets TWO relationship entries — one per relationshipType. Don't try to cram both into a single label like "past lover and political contact" — split them so each pill can be color-coded and filtered correctly.
- fromName / toName MUST reference a character you declared in the characters array (by exact name).
- "visibleAfter" = when the viewer first learns about the relationship. If a pair's romantic past is revealed in S3 but their business collaboration starts in S1, emit TWO relationships with different visibleAfter tags — each surfaces on the slider at the right moment.

## Timeline events

- 5–15 major plot beats per season / movie. NOT an exhaustive recap — only the beats a viewer might forget or want to reference.
- Each event references characters by name via characterNames.
- importance: 1 (minor reference) to 5 (saga-defining beat).
- Skip beats that would spoil things; tag visibleAfter at the point the event has clearly happened.

## Glossary

- Aim for **10–25 terms** for any show or film with non-trivial worldbuilding — err on the side of MORE. It's fine to skip only when there's genuinely nothing specialized (most sitcoms, simple romantic comedies). Succession alone has easily 15–20 worthy entries: proxy battle, tender offer, PGM, ATN, GoJo, Waystar, Eastnet, parliamentary proxy, brass ring, Vaulter, Pierce, AAAAH!, NRPI, bear hug, poison pill, stock buy-back, etc.
- DON'T skip mid-obscurity terms ("IPO", "board of directors") just because they're real-world concepts — if a viewer might ask "what does this mean in THIS story", include it.
- Things that deserve entries: in-universe acronyms, proper nouns (companies, factions, places), business / legal / political jargon, recurring catchphrases, named objects or rituals, specialized verbs the characters use.
- **Sort the array with the MOST OBSCURE terms first, MOST COMMON last.** A reader scanning from the top should hit the things they're most likely confused about before the merely-adjacent ones. A proper noun like "Bene Gesserit" sorts above "melange" sorts above "heir".
- category: "world" (setting elements), "faction" (houses/organizations), "jargon" (in-universe terminology or specialized real-world terms), "concept" (themes / recurring ideas).

## Quality bar

- Use ONLY information that appears in the grounding data (TMDB cast + overview, Wikipedia summary, episode summaries). Do NOT invent characters, actors, or plot points not in the source.
- If the grounding data is thin, return a thinner companion. It's fine to emit 8 characters and 6 timeline beats for a limited series.
- If you don't know when something was revealed, leave it for the admin to correct — tag conservatively (later rather than earlier).
- Never output empty strings for required fields; omit items you can't describe confidently.`;
}

// ─── Tool schema ────────────────────────────────────────────────────────────

const COMPANION_TOOL: Anthropic.Tool = {
  name: "draft_watch_companion",
  description: "Emit a structured Watch Companion draft. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      characters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            actorName: { type: ["string", "null"] },
            actorTmdbId: { type: ["integer", "null"] },
            baseDescription: { type: "string", description: "Spoiler-safe introduction. 1–2 sentences." },
            group: { type: ["string", "null"], description: "Faction / family / team for color-coding." },
            visibleAfter: {
              type: "object",
              properties: {
                seconds: { type: ["integer", "null"] },
                season: { type: ["integer", "null"] },
                episode: { type: ["integer", "null"] },
              },
              required: ["seconds", "season", "episode"],
              additionalProperties: false,
            },
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fact: { type: "string" },
                  factType: { type: "string", enum: [...FACT_TYPES] },
                  visibleAfter: {
                    type: "object",
                    properties: {
                      seconds: { type: ["integer", "null"] },
                      season: { type: ["integer", "null"] },
                      episode: { type: ["integer", "null"] },
                    },
                    required: ["seconds", "season", "episode"],
                    additionalProperties: false,
                  },
                },
                required: ["fact", "factType", "visibleAfter"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "actorName", "actorTmdbId", "baseDescription", "group", "visibleAfter", "facts"],
          additionalProperties: false,
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fromName: { type: "string" },
            toName: { type: "string" },
            relationshipType: { type: "string", enum: [...RELATIONSHIP_TYPES] },
            label: { type: "string" },
            directed: { type: "boolean" },
            visibleAfter: {
              type: "object",
              properties: {
                seconds: { type: ["integer", "null"] },
                season: { type: ["integer", "null"] },
                episode: { type: ["integer", "null"] },
              },
              required: ["seconds", "season", "episode"],
              additionalProperties: false,
            },
          },
          required: ["fromName", "toName", "relationshipType", "label", "directed", "visibleAfter"],
          additionalProperties: false,
        },
      },
      timelineEvents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            characterNames: { type: "array", items: { type: "string" } },
            importance: { type: "integer", minimum: 1, maximum: 5 },
            visibleAfter: {
              type: "object",
              properties: {
                seconds: { type: ["integer", "null"] },
                season: { type: ["integer", "null"] },
                episode: { type: ["integer", "null"] },
              },
              required: ["seconds", "season", "episode"],
              additionalProperties: false,
            },
          },
          required: ["description", "characterNames", "importance", "visibleAfter"],
          additionalProperties: false,
        },
      },
      glossary: {
        type: "array",
        items: {
          type: "object",
          properties: {
            term: { type: "string" },
            definition: { type: "string" },
            category: { type: ["string", "null"], enum: [...GLOSSARY_CATEGORIES, null] },
            visibleAfter: {
              type: "object",
              properties: {
                seconds: { type: ["integer", "null"] },
                season: { type: ["integer", "null"] },
                episode: { type: ["integer", "null"] },
              },
              required: ["seconds", "season", "episode"],
              additionalProperties: false,
            },
          },
          required: ["term", "definition", "category", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["characters", "relationships", "timelineEvents", "glossary"],
    additionalProperties: false,
  },
};

// ─── Grounding data → user message ──────────────────────────────────────────

function buildUserMessage(grounding: CompanionGroundingData, season: number | null): string {
  const sections: string[] = [];

  sections.push(`TITLE: ${grounding.title}${grounding.year ? ` (${grounding.year})` : ""}`);
  sections.push(`MEDIA TYPE: ${grounding.source}`);
  if (grounding.source === "movie" && grounding.runtimeSeconds) {
    const minutes = Math.round(grounding.runtimeSeconds / 60);
    sections.push(`RUNTIME: ${minutes} minutes (${grounding.runtimeSeconds} seconds — use this as the upper bound for visibleAfter.seconds)`);
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

  if (grounding.cast.length > 0) {
    const castLines = grounding.cast.slice(0, 30).map((c) => `- ${c.name} as ${c.character || "(unknown role)"} [actor tmdbId: ${c.tmdbId}]`).join("\n");
    sections.push(`\nCAST (top ${Math.min(30, grounding.cast.length)} from TMDB — use actorTmdbId values exactly):\n${castLines}`);
  }

  if (grounding.source === "tv" && grounding.seasons) {
    const seasonSummary = grounding.seasons.map((s) => `- S${s.seasonNumber}: ${s.episodeCount} episodes${s.overview ? ` — ${s.overview.slice(0, 200)}` : ""}`).join("\n");
    sections.push(`\nALL SEASONS (for context):\n${seasonSummary}`);

    if (season !== null) {
      const target = grounding.seasons.find((s) => s.seasonNumber === season);
      if (target && target.episodes.length > 0) {
        const epLines = target.episodes.map((e) => `- S${season}E${e.episodeNumber} "${e.name}": ${(e.overview ?? "(no summary)").slice(0, 500)}`).join("\n");
        sections.push(`\nSEASON ${season} EPISODES (use these to set visibleAfter):\n${epLines}`);
      }
    }
  }

  if (grounding.wikipediaEpisodes) {
    sections.push(`\nWIKIPEDIA EPISODE CONTEXT:\n${grounding.wikipediaEpisodes.slice(0, 4000)}`);
  }

  sections.push(`\nGenerate the Watch Companion draft now. Every piece of content must have a correct visibleAfter. When uncertain, tag later rather than earlier. Never invent characters or facts not supported by the grounding data above.`);

  return sections.join("\n");
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

export interface GenerateDraftInput {
  grounding: CompanionGroundingData;
  season: number | null;
}

export async function draftWatchCompanion(input: GenerateDraftInput): Promise<CompanionDraft> {
  const client = getAnthropic();
  const userMessage = buildUserMessage(input.grounding, input.season);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [COMPANION_TOOL],
    tool_choice: { type: "tool", name: "draft_watch_companion" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a structured companion draft");
  }
  return normalizeDraft(toolUse.input);
}

// ─── Normalization ──────────────────────────────────────────────────────────

function normVisibleAfter(raw: unknown): VisibleAfter {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    seconds: typeof v.seconds === "number" && v.seconds >= 0 ? Math.floor(v.seconds) : null,
    season: typeof v.season === "number" && v.season > 0 ? Math.floor(v.season) : null,
    episode: typeof v.episode === "number" && v.episode > 0 ? Math.floor(v.episode) : null,
  };
}

function normalizeDraft(raw: unknown): CompanionDraft {
  const input = (raw ?? {}) as Partial<CompanionDraft>;

  const characters: DraftCharacter[] = Array.isArray(input.characters)
    ? input.characters
        .filter((c): c is DraftCharacter => typeof c === "object" && c !== null && typeof (c as DraftCharacter).name === "string" && typeof (c as DraftCharacter).baseDescription === "string")
        .slice(0, 30)
        .map((c) => ({
          name: c.name.slice(0, 120),
          actorName: typeof c.actorName === "string" && c.actorName.length > 0 ? c.actorName.slice(0, 120) : null,
          actorTmdbId: typeof c.actorTmdbId === "number" ? c.actorTmdbId : null,
          baseDescription: c.baseDescription.slice(0, 600),
          group: typeof c.group === "string" && c.group.length > 0 ? c.group.slice(0, 80) : null,
          visibleAfter: normVisibleAfter(c.visibleAfter),
          facts: Array.isArray(c.facts)
            ? c.facts
                .filter((f): f is DraftCharacterFact => typeof f === "object" && f !== null && typeof (f as DraftCharacterFact).fact === "string")
                .slice(0, 10)
                .map((f) => ({
                  fact: f.fact.slice(0, 400),
                  factType: (FACT_TYPES as readonly string[]).includes(f.factType) ? (f.factType as FactType) : "other",
                  visibleAfter: normVisibleAfter(f.visibleAfter),
                }))
            : [],
        }))
    : [];

  const charNames = new Set(characters.map((c) => c.name));

  const relationships: DraftRelationship[] = Array.isArray(input.relationships)
    ? input.relationships
        .filter((r): r is DraftRelationship => typeof r === "object" && r !== null)
        .map((r) => ({
          fromName: typeof r.fromName === "string" ? r.fromName : "",
          toName: typeof r.toName === "string" ? r.toName : "",
          relationshipType: (RELATIONSHIP_TYPES as readonly string[]).includes(r.relationshipType) ? (r.relationshipType as RelationshipType) : "other",
          label: typeof r.label === "string" && r.label.length > 0 ? r.label.slice(0, 80) : "related to",
          visibleAfter: normVisibleAfter(r.visibleAfter),
          directed: r.directed !== false,
        }))
        .filter((r) => charNames.has(r.fromName) && charNames.has(r.toName) && r.fromName !== r.toName)
        .slice(0, 60)
    : [];

  const timelineEvents: DraftTimelineEvent[] = Array.isArray(input.timelineEvents)
    ? input.timelineEvents
        .filter((e): e is DraftTimelineEvent => typeof e === "object" && e !== null && typeof (e as DraftTimelineEvent).description === "string")
        .slice(0, 40)
        .map((e) => ({
          description: e.description.slice(0, 500),
          characterNames: Array.isArray(e.characterNames)
            ? e.characterNames.filter((n): n is string => typeof n === "string" && charNames.has(n))
            : [],
          importance: typeof e.importance === "number" && e.importance >= 1 && e.importance <= 5 ? Math.floor(e.importance) : 3,
          visibleAfter: normVisibleAfter(e.visibleAfter),
        }))
    : [];

  const glossary: DraftGlossaryTerm[] = Array.isArray(input.glossary)
    ? input.glossary
        .filter((g): g is DraftGlossaryTerm => typeof g === "object" && g !== null && typeof (g as DraftGlossaryTerm).term === "string" && typeof (g as DraftGlossaryTerm).definition === "string")
        .slice(0, 25)
        .map((g) => ({
          term: g.term.slice(0, 80),
          definition: g.definition.slice(0, 500),
          category: typeof g.category === "string" && (GLOSSARY_CATEGORIES as readonly string[]).includes(g.category) ? (g.category as GlossaryCategory) : null,
          visibleAfter: normVisibleAfter(g.visibleAfter),
        }))
    : [];

  return { characters, relationships, timelineEvents, glossary };
}
