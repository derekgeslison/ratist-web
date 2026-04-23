import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type PriorSeasonCanon,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  formatGroundingContext,
  formatPriorSeasonCanon,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the CHARACTERS section of a Watch Companion for a movie or TV show. Your output is NOT the final artwork — an admin reviews it before it goes live. Accuracy matters more than coverage.

## Your only job

Emit 8–20 characters. Each one:

- "name" — the character's in-story name as fans would say it. "Siobhan 'Shiv' Roy" is fine.
- "actorName" and "actorTmdbId" — MUST match someone in the provided cast list exactly. Copy the tmdbId.
- "baseDescription" — SPOILER-SAFE identity. Describe WHO the character IS as a person in the story's world, NOT their current role or title (which changes).
  - GOOD: "A longtime Waystar executive and Logan's financial strategist. Loyal but increasingly cynical."
  - BAD: "CFO of Waystar Royco" — gets stale when the role changes.
  - GOOD: "The Roy family's outsider son-in-law. Pragmatic, self-serving, an anxious social climber."
  - BAD: "Shiv's husband and head of the news division" — both facts change.
- "group" — their faction, family, team. Null if not applicable. Used for color-coding.
- "visibleAfter" — when they first appear on-screen. See guidance below.

Do NOT include facts, relationships, timeline events, or glossary entries — other calls handle those. ONLY characters.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Use ONLY information that appears in the grounding data (TMDB cast + overview, Wikipedia summary, episode summaries).
- Skip one-scene cameos unless essential.
- For recurring ensemble shows (Succession, Yellowstone, GoT), aim toward 15–20. For a movie, 8–12 is usually right.`;

const TOOL: Anthropic.Tool = {
  name: "emit_characters",
  description: "Emit the character list for a Watch Companion. Call exactly once.",
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
            baseDescription: { type: "string", description: "Spoiler-safe identity. 1–2 sentences." },
            group: { type: ["string", "null"] },
            visibleAfter: VISIBLE_AFTER_SCHEMA,
          },
          required: ["name", "actorName", "actorTmdbId", "baseDescription", "group", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["characters"],
    additionalProperties: false,
  },
};

export async function draftCharacters(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  priorCanon: PriorSeasonCanon | null = null,
): Promise<DraftCharacter[]> {
  const userMessage = formatGroundingContext(grounding, season)
    + formatPriorSeasonCanon(priorCanon)
    + `\n\nEmit the characters now. Each must cite an actorTmdbId from the cast list above and include a correct visibleAfter.`;
  const result = await callTool<{ characters: unknown[] }>({
    client,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tool: TOOL,
    maxTokens: 4096,
  });
  return Array.isArray(result.characters)
    ? result.characters
        .filter((c): c is DraftCharacter => typeof c === "object" && c !== null && typeof (c as DraftCharacter).name === "string" && typeof (c as DraftCharacter).baseDescription === "string")
        .slice(0, 30)
        .map((c) => ({
          name: c.name.slice(0, 120),
          actorName: typeof c.actorName === "string" && c.actorName.length > 0 ? c.actorName.slice(0, 120) : null,
          actorTmdbId: typeof c.actorTmdbId === "number" ? c.actorTmdbId : null,
          baseDescription: c.baseDescription.slice(0, 600),
          group: typeof c.group === "string" && c.group.length > 0 ? c.group.slice(0, 80) : null,
          visibleAfter: normVisibleAfter(c.visibleAfter),
        }))
    : [];
}
