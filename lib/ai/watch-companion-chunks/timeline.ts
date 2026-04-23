import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftTimelineEvent,
  type PriorSeasonCanon,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  formatGroundingContext,
  formatPriorSeasonCanon,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the TIMELINE section of a Watch Companion — major plot beats a viewer might want to reference mid-show.

## Your only job

Emit 8–20 beats per TV season / 6–12 per movie. This is NOT optional — a companion with an empty or 2-item timeline is a failure. Each episode of a serialized show has at least one memorable beat worth capturing.

- "description" — a short, specific statement of what happened.
- "characterNames" — an array of character names from the provided list who are directly involved.
- "importance" — 1 (minor reference) to 5 (saga-defining beat).
- "visibleAfter" — when the beat clearly happens on screen.

Only timeline events. Don't emit characters, facts, relationships, or glossary entries.

${VISIBLE_AFTER_GUIDANCE}

## What to capture

- Cliffhangers, deaths, betrayals
- Alliance shifts, relationship changes
- Major arguments, plot-turning decisions
- Big reveals, recontextualizing moments
- Season-spanning arcs (pick the moment they become undeniable)

## What to skip

- Exposition viewers remember effortlessly
- Subplots that don't affect the main story
- Beats that would spoil — tag visibleAfter AT the point they clearly happen.`;

const TOOL: Anthropic.Tool = {
  name: "emit_timeline",
  description: "Emit timeline events for a Watch Companion. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            characterNames: { type: "array", items: { type: "string" } },
            importance: { type: "integer", minimum: 1, maximum: 5 },
            visibleAfter: VISIBLE_AFTER_SCHEMA,
          },
          required: ["description", "characterNames", "importance", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["events"],
    additionalProperties: false,
  },
};

export async function draftTimeline(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  characters: DraftCharacter[],
  priorCanon: PriorSeasonCanon | null = null,
): Promise<DraftTimelineEvent[]> {
  const charList = characters.map((c) => `- ${c.name}`).join("\n");
  const userMessage = formatGroundingContext(grounding, season, { includeCast: false })
    + formatPriorSeasonCanon(priorCanon)
    + `\n\n## Characters already drafted (reference by exact name in characterNames)\n\n${charList}`
    + `\n\nEmit the timeline now. Minimum 8 beats for a season, 6 for a movie.`;

  const result = await callTool<{ events: unknown[] }>({
    client,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tool: TOOL,
    maxTokens: 4096,
  });

  const nameSet = new Set(characters.map((c) => c.name));
  return Array.isArray(result.events)
    ? result.events
        .filter((e): e is DraftTimelineEvent => typeof e === "object" && e !== null
          && typeof (e as DraftTimelineEvent).description === "string")
        .slice(0, 40)
        .map((e) => ({
          description: e.description.slice(0, 500),
          characterNames: Array.isArray(e.characterNames)
            ? e.characterNames.filter((n): n is string => typeof n === "string" && nameSet.has(n))
            : [],
          importance: typeof e.importance === "number" && e.importance >= 1 && e.importance <= 5 ? Math.floor(e.importance) : 3,
          visibleAfter: normVisibleAfter(e.visibleAfter),
        }))
    : [];
}
