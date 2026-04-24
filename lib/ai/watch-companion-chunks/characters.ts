import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftCharacterActor,
  type DraftNameAlias,
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

- "name" — the character's in-story name as fans would say it. "Siobhan 'Shiv' Roy" is fine. **See "Twist-reveal names" below if the character's identity changes mid-story.**
- "actorName" and "actorTmdbId" — the PRIMARY (earliest-visible) actor. MUST match someone in the provided cast list exactly. Copy the tmdbId. If the character has multiple actors, also fill the "actors" array (below).
- "baseDescription" — SPOILER-SAFE identity. Describe WHO the character IS as a person in the story's world, NOT their current role or title (which changes).
  - GOOD: "A longtime Waystar executive and Logan's financial strategist. Loyal but increasingly cynical."
  - BAD: "CFO of Waystar Royco" — gets stale when the role changes.
  - GOOD: "The Roy family's outsider son-in-law. Pragmatic, self-serving, an anxious social climber."
  - BAD: "Shiv's husband and head of the news division" — both facts change.
- "group" — their faction, family, team. Null if not applicable. Used for color-coding.
- "visibleAfter" — when they first appear on-screen. See guidance below. For multi-actor characters, set this to the EARLIEST actor's appearance.
- "actors" — multi-actor array (see below). Empty array \`[]\` for single-actor characters.
- "nameAliases" — twist-reveal names (see below). Empty array \`[]\` when the name never changes.

Do NOT include facts, relationships, timeline events, or glossary entries — other calls handle those. ONLY characters.

## Multi-actor characters (age variants, twins, recasts) — consolidate into ONE character

When a single character is portrayed by multiple actors — young / adult / elderly versions, twins playing one role, or the show recast them mid-run — emit ONE character with all actors in the "actors" array. Do NOT split them into multiple character entries.

Each actor entry:
- "actorName" / "actorTmdbId" — from the cast list, exact match
- "note" — short label: "young", "adult", "elderly", "twin", etc. Null if single-actor.
- "visibleAfter" — when THIS actor's version is first shown on-screen

✅ CORRECT (Interstellar — Murph is one character):
\`\`\`
{
  name: "Murph Cooper",
  actorName: "Mackenzie Foy",  // the earliest-visible actor
  actorTmdbId: 1020846,
  baseDescription: "Cooper's daughter, a stubborn intuitive scientist-in-waiting who loves her father fiercely.",
  visibleAfter: { seconds: 900 },
  actors: [
    { actorName: "Mackenzie Foy", actorTmdbId: 1020846, note: "young", visibleAfter: { seconds: 900 } },
    { actorName: "Jessica Chastain", actorTmdbId: 1213786, note: "adult", visibleAfter: { seconds: 4500 } },
    { actorName: "Ellen Burstyn", actorTmdbId: 3968, note: "elderly", visibleAfter: { seconds: 9800 } }
  ],
  nameAliases: []
}
\`\`\`

❌ WRONG — three separate "Murph" entries clutter the card list and split relationships.

Apply this rule for: Interstellar-style age variants, Dark's triple-casting, It (young-and-adult Losers Club), Titanic (Young Rose / Old Rose), and similar recast patterns.

## Twins / interchangeable co-stars playing ONE role

A different multi-actor pattern: two (or more) actors rotate playing the SAME single character throughout a show with no narrative switch point — Mary-Kate and Ashley Olsen both play Michelle Tanner in Full House from episode one onward, for example. Emit this as ONE character with BOTH actors in the \`actors\` array and the SAME \`visibleAfter\` (the character's first-appearance timestamp). Leave the \`note\` field null for each — there's no "young / adult" distinction to make.

✅ CORRECT:
\`\`\`
{
  name: "Michelle Tanner",
  actorName: "Mary-Kate Olsen",
  actorTmdbId: 73756,
  baseDescription: "The youngest Tanner, a precocious toddler with an oversized personality.",
  visibleAfter: { season: 1, episode: 1 },
  actors: [
    { actorName: "Mary-Kate Olsen", actorTmdbId: 73756, note: null, visibleAfter: { season: 1, episode: 1 } },
    { actorName: "Ashley Olsen", actorTmdbId: 73755, note: null, visibleAfter: { season: 1, episode: 1 } }
  ],
  nameAliases: []
}
\`\`\`

The viewer displays both names side-by-side ("played by Mary-Kate Olsen & Ashley Olsen") because they share the same visibleAfter.

## Twist-reveal names (Khan / Kaiser Söze / Tyler Durden)

If the character's identity is a plot twist — they're introduced under one name but later revealed to have a real name — use the PRE-REVEAL name as the primary \`name\`. List the revealed name(s) in \`nameAliases\` with the visibleAfter tagged at the reveal moment.

✅ CORRECT (Star Trek Into Darkness):
\`\`\`
{
  name: "John Harrison",
  actorName: "Benedict Cumberbatch",
  actorTmdbId: 71580,
  baseDescription: "A mysterious Starfleet operative whose motives — and identity — unravel as Kirk digs into his past.",
  visibleAfter: { seconds: 300 },
  actors: [],
  nameAliases: [
    { name: "Khan Noonien Singh", visibleAfter: { seconds: 5100 } }
  ]
}
\`\`\`

The viewer will show "John Harrison" initially, then switch to "Khan" once the slider crosses the reveal. Putting the twist name up front would spoil it the moment Cumberbatch appears.

Skip nameAliases when the character has no identity twist — most characters get \`nameAliases: []\`.

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
            actors: {
              type: "array",
              description: "Additional actors for multi-actor characters. Empty [] for single-actor characters.",
              items: {
                type: "object",
                properties: {
                  actorName: { type: "string" },
                  actorTmdbId: { type: ["integer", "null"] },
                  note: { type: ["string", "null"] },
                  visibleAfter: VISIBLE_AFTER_SCHEMA,
                },
                required: ["actorName", "actorTmdbId", "note", "visibleAfter"],
                additionalProperties: false,
              },
            },
            nameAliases: {
              type: "array",
              description: "Twist-reveal names. Empty [] for characters whose name never changes.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  visibleAfter: VISIBLE_AFTER_SCHEMA,
                },
                required: ["name", "visibleAfter"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "actorName", "actorTmdbId", "baseDescription", "group", "visibleAfter", "actors", "nameAliases"],
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
  // Include subtitles — even though baseDescription is identity-only, the
  // actors[] visibleAfter and nameAliases[] visibleAfter fields both need
  // accurate dialogue timestamps. Without subs, Sonnet was guessing reveal
  // times (e.g., Khan's name reveal landed at 85:00 instead of the actual
  // 68:00 in dialogue).
  const userMessage = formatGroundingContext(grounding, season)
    + formatPriorSeasonCanon(priorCanon)
    + `\n\nEmit the characters now. Each must cite an actorTmdbId from the cast list above and include a correct visibleAfter. For multi-actor characters and twist-reveal names, use the DIALOGUE EXCERPT timestamps as ground truth for when each actor/name becomes visible.`;
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
        .map((c) => {
          const actors: DraftCharacterActor[] = Array.isArray((c as DraftCharacter).actors)
            ? ((c as DraftCharacter).actors ?? [])
                .filter((a): a is DraftCharacterActor => typeof a === "object" && a !== null && typeof (a as DraftCharacterActor).actorName === "string")
                .slice(0, 6)
                .map((a) => ({
                  actorName: a.actorName.slice(0, 120),
                  actorTmdbId: typeof a.actorTmdbId === "number" ? a.actorTmdbId : null,
                  note: typeof a.note === "string" && a.note.length > 0 ? a.note.slice(0, 40) : null,
                  visibleAfter: normVisibleAfter(a.visibleAfter),
                }))
            : [];
          const nameAliases: DraftNameAlias[] = Array.isArray((c as DraftCharacter).nameAliases)
            ? ((c as DraftCharacter).nameAliases ?? [])
                .filter((n): n is DraftNameAlias => typeof n === "object" && n !== null && typeof (n as DraftNameAlias).name === "string")
                .slice(0, 4)
                .map((n) => ({
                  name: n.name.slice(0, 120),
                  visibleAfter: normVisibleAfter(n.visibleAfter),
                }))
            : [];
          return {
            name: c.name.slice(0, 120),
            actorName: typeof c.actorName === "string" && c.actorName.length > 0 ? c.actorName.slice(0, 120) : null,
            actorTmdbId: typeof c.actorTmdbId === "number" ? c.actorTmdbId : null,
            baseDescription: c.baseDescription.slice(0, 600),
            group: typeof c.group === "string" && c.group.length > 0 ? c.group.slice(0, 80) : null,
            visibleAfter: normVisibleAfter(c.visibleAfter),
            actors,
            nameAliases,
          };
        })
    : [];
}
