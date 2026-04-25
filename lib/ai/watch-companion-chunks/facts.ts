import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftFact,
  type PriorSeasonCanon,
  FACT_TYPES,
  type FactType,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  formatGroundingContext,
  formatPriorSeasonCanon,
  formatEpisodeModeAddendum,
  formatAiringModeAddendum,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the CHARACTER FACTS section of a Watch Companion — evolving traits that unlock as the story progresses. Role changes, deaths, major arc moments, reveals.

## Your only job

For each character in the provided list, emit 0–8 facts. **Be generous** when a character's role/standing shifts multiple times. Keep descriptions for character identity (the "who they are" stuff) OUT — that's in baseDescription already. Facts are evolutions and events specifically.

- "characterName" — must EXACTLY match a character name from the provided list.
- "fact" — a short, specific statement. "Becomes acting CEO in S3E5" / "Dies in the S4 premiere" / "Reveals she orchestrated the cruise scandal in S2E10".
- "factType": one of ${FACT_TYPES.join(", ")}.
- "visibleAfter" — when this fact becomes known.

Only ONE kind of content. Don't emit characters, relationships, timeline events, or glossary entries.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Ground every fact in the grounding data. If you don't know when something happened, omit or tag LATE.
- A character whose title changes 3 times across a season gets 3 role_change facts tagged at each switch point.
- Don't restate the baseDescription. Facts should ADD new information, not paraphrase.
- Fine to emit zero facts for a character whose baseDescription already covers everything important about them (simple supporting role, no arc).`;

const TOOL: Anthropic.Tool = {
  name: "emit_facts",
  description: "Emit character facts for a Watch Companion. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            characterName: { type: "string" },
            fact: { type: "string" },
            factType: { type: "string", enum: [...FACT_TYPES] },
            visibleAfter: VISIBLE_AFTER_SCHEMA,
          },
          required: ["characterName", "fact", "factType", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["facts"],
    additionalProperties: false,
  },
};

export async function draftFacts(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  characters: DraftCharacter[],
  priorCanon: PriorSeasonCanon | null = null,
  episode: number | null = null,
  airing: { eligibleEpisodes: number[] } | null = null,
): Promise<DraftFact[]> {
  const charList = characters.map((c) => `- ${c.name}${c.actorName ? ` (played by ${c.actorName})` : ""}: ${c.baseDescription}`).join("\n");
  const userMessage = formatGroundingContext(grounding, season, { episode })
    + formatPriorSeasonCanon(priorCanon)
    + `\n\n## Characters already drafted (reference these EXACTLY by name)\n\n${charList}`
    + (episode !== null && season !== null ? formatEpisodeModeAddendum(season, episode, "facts") : "")
    + (airing && season !== null ? formatAiringModeAddendum(season, airing.eligibleEpisodes, "facts") : "")
    + `\n\nEmit the facts now. 0–8 per character. Every characterName must match one of the names above exactly.`;

  const result = await callTool<{ facts: unknown[] }>({
    client,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tool: TOOL,
    maxTokens: 4096,
  });

  const nameSet = new Set(characters.map((c) => c.name));
  return Array.isArray(result.facts)
    ? result.facts
        .filter((f): f is DraftFact => typeof f === "object" && f !== null
          && typeof (f as DraftFact).fact === "string"
          && typeof (f as DraftFact).characterName === "string")
        .filter((f) => nameSet.has(f.characterName))
        .slice(0, 120)
        .map((f) => ({
          characterName: f.characterName,
          fact: f.fact.slice(0, 400),
          factType: (FACT_TYPES as readonly string[]).includes(f.factType) ? (f.factType as FactType) : "other",
          visibleAfter: normVisibleAfter(f.visibleAfter),
        }))
    : [];
}
