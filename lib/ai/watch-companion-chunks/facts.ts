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

const SYSTEM_PROMPT = `You are drafting the CHARACTER FACTS section of a Watch Companion — the things a viewer would want to know about each character as the story unfolds.

## Your only job

For each character in the provided list, emit 1–8 facts that read as a chronological highlight reel of what that character DOES, REVEALS, or HAS HAPPEN TO THEM. **Most characters with screen time should get at least 2–3 facts.** Zero facts is reserved for genuinely peripheral characters whose entire role is captured by baseDescription.

What a fact is:
- "characterName" — must EXACTLY match a character name from the provided list.
- "fact" — a short, specific statement that adds new information beyond baseDescription.
- "factType": one of ${FACT_TYPES.join(", ")}.
- "visibleAfter" — when this fact becomes known.

Only ONE kind of content. Don't emit characters, relationships, timeline events, or glossary entries.

## What counts as a fact — three categories, in order of priority

**1. Arc / state changes** (factType: role_change, arc, relationship_change, death, reveal):
- "Becomes acting CEO in S3E5" → role_change
- "Dies in the S4 premiere" → death
- "Reveals she orchestrated the cruise scandal in S2E10" → reveal
- "Defects from the First Order" → arc

**2. Plot beats — what the character DOES that drives the story** (factType: other):
The bulk of facts for ensemble, caper, and heist movies fall here. Supporting characters in Inception, Ocean's Eleven, the Avengers, etc. don't have personal arcs — but they have specific scene-level contributions the audience tracks. Emit these.
- "Forges Browning's appearance to manipulate Fischer in the dream" (Eames in Inception)
- "Drives the van that anchors the dream's first level" (Yusuf in Inception)
- "Fights the gravity-shifting hotel battle to keep the team's bodies from waking" (Arthur in Inception)
- "Cracks the casino vault using the pinch device" (Livingston in Ocean's Eleven)
- "Holds the line at the Battle of Wakanda before the snap" (T'Challa in Infinity War)

**3. Notable backstory / revealed history** (factType: reveal or other):
Information about a character that becomes known partway through and that the audience tracks. "Was a child soldier", "is the protagonist's biological father", "lost her family in the bombing".

## What is NOT a fact (keep these out)

- Identity description ("brilliant scientist", "loyal friend") — that's baseDescription's job.
- Trait restatements ("is sarcastic", "loves his daughter") — also baseDescription.
- One-line throwaway moments with no plot significance ("orders coffee in the diner scene").
- Anything not grounded in the supplied grounding data.

## When zero facts IS appropriate

Reserve the empty list for:
- Background / one-event characters (someone who only exists to deliver one line and then never reappears — though those characters mostly shouldn't have a card at all; flag back to the characters draft if you spot one).
- A character whose only narrative function IS their identity (a celebrity cameo where their cameo presence is the whole point).

If the character has screen time across multiple scenes and the grounding data describes them doing things, they should get 2–3 facts at minimum.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Ground every fact in the grounding data. If you don't know when something happened, omit or tag LATE.
- A character whose title changes 3 times across a season gets 3 role_change facts tagged at each switch point.
- Heist / caper / ensemble action movies in particular: each team member should get 2–4 facts covering their distinctive contribution to the operation. The audience came for the team dynamics; flag what each member brings.
- Don't restate the baseDescription. Facts should ADD new information, not paraphrase.
- Be generous with category #2 (plot beats). Most "missing facts" complaints stem from supporting characters whose screen time goes uncaptured because the AI thought facts had to be arc-level.`;

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
