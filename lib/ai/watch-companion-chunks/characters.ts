import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftCharacterActor,
  type DraftNameAlias,
  type DraftGroupChange,
  type PriorSeasonCanon,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  formatGroundingContext,
  formatPriorSeasonCanon,
  formatEpisodeModeAddendum,
  formatAiringModeAddendum,
  callTool,
} from "./shared";
import { detectEdgeCases, renderEdgeCasePrompts } from "./character-edge-cases";

// ──────────────────────────────────────────────────────────────────
// Base prompt — rules that apply to every work, regardless of genre
// or special premise. Edge-case rules (multi-actor, body swaps,
// faction defections, etc.) are pulled from character-edge-cases.ts
// and conditionally injected based on signals in the grounding
// payload, so a rom-com doesn't read past 200 lines of body-swap
// guidance to find the parts it actually needs.
//
// Three small / always-on extras stay in the base because they're
// hard to detect by keyword without leaking the spoiler (twist-
// reveal names, inverse twist) or because they're trivially short
// (cover identities). Their cost is negligible.
// ──────────────────────────────────────────────────────────────────
const BASE_PROMPT = `You are drafting the CHARACTERS section of a Watch Companion for a movie or TV show. Your output is NOT the final artwork — an admin reviews it before it goes live. Accuracy matters more than coverage.

## Your only job

Aim for ~10–15 characters total (see Quality bar). Each one:

- "name" — the character's in-story name as fans would say it. "Siobhan 'Shiv' Roy" is fine. **See "Twist-reveal names" below if the character's identity changes mid-story.**
- "actorName" and "actorTmdbId" — the PRIMARY (earliest-visible) actor. MUST match someone in the provided cast list exactly. Copy the tmdbId. If the character has multiple actors, also fill the "actors" array.
- "baseDescription" — SPOILER-SAFE identity. Describe WHO the character IS as a person in the story's world, NOT their current role or title (which changes).
  - GOOD: "A longtime Waystar executive and Logan's financial strategist. Loyal but increasingly cynical."
  - BAD: "CFO of Waystar Royco" — gets stale when the role changes.
- "group" — their faction, family, team AT FIRST APPEARANCE (cover identity / starting allegiance). Null if not applicable. Used for color-coding.
- "visibleAfter" — when they first appear on-screen.
- "actors" — multi-actor array. Empty array \`[]\` for single-actor characters.
- "nameAliases" — twist-reveal names. Empty array \`[]\` when the name never changes.
- "groupHistory" — faction/side changes. Empty array \`[]\` when the character's faction never changes.

Do NOT include facts, relationships, timeline events, or glossary entries — other calls handle those. ONLY characters.

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

## Inverse twist — two characters revealed to be one person

Sometimes the audience tracks two seemingly separate characters and only later learns they're the same person — Mr. Robot / Elliot Alderson in Mr. Robot, Frank in Donnie Darko. Emit BOTH as separate cards. That mirrors how the audience is meant to perceive them up to the reveal. Use a fact ("revealed to be a projection of X") rather than collapsing the cards.

## Cover identities, personas, disguises, multiple personalities — KEEP AS ONE character

A character pretending to be someone else is NOT a separate character. Undercover cops, spies, characters in disguise, characters using a fake name — all ONE card. Same for dissociative identity disorder / multiple personalities (Sybil, Split): one body, one card. The cover name only goes in \`nameAliases\` if the alias is sustained AND audience-known AND meaningfully part of how viewers refer to the character — most personas don't need an alias entry at all.

❌ WRONG — emitting one card per personality for a DID character.
❌ WRONG — emitting "Laszlo Cravensworth" AND "Jackie Daytona" as two characters.

## When NOT to create a card — bias toward fewer, denser characters

Most movies and shows yield ~10–15 trackable characters. Beyond that the cast tab gets hectic and the audience can't see the leads. Skip cards for:

- **Narrators** who aren't characters in the story (Ron Howard in Arrested Development). If the narrator IS also a character (Old Rose narrating young Rose in Titanic), use the character's name and treat narration as a fact.
- **One-event characters** ("the bartender who hears the protagonist's confession"). Encode as a timeline event and optionally a fact on a MAJOR character.
- **Implied / never-on-screen characters** (Maris in Frasier, Vera in Cheers). Punchlines, not tracked characters.
- **Generic crowd / faction members.** Stormtroopers as a group are not characters; specific named ones the audience tracks (FN-2187 → Finn) are.

When in doubt, prefer encoding the role as a timeline event and a character event on a MAJOR character.

## Exclude body doubles, acting doubles, stunt performers, stand-ins

\`actorName\` / \`actorTmdbId\` / \`actors[]\` MUST contain ONLY the principal credited actor(s) for the role. Audience-facing performance only. Skip cast-list entries with "double" in the role label — production credits, not characters. If the cast list says "Dayleigh Nelson — Acting Double for Nick", IGNORE that entry; whoever plays Nick on-screen as the lead performance is the actor for Nick's card.

## How many distinct factions / groups?

The cast tab and relationships map color-code by \`group\` from a palette of 8 colors. Beyond 8 distinct group values, colors repeat — visually broken.

Aim for **3–6 distinct factions** for most works. **Up to 8** is fine for genuinely sprawling political-faction stories (Game of Thrones houses, Star Wars factions). Don't exceed 8.

Bias toward merging or omitting rather than minting:
- Merge close-kin factions when the audience reads them as one bloc.
- Use \`null\` for one-off, unaffiliated, or independent characters.
- Don't spin up factions for one or two characters who happen to share a workplace if the audience doesn't track them as a faction.
- Don't create a faction just to label a single character.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Use ONLY information that appears in the grounding data (TMDB cast + overview, Wikipedia summary, episode summaries).
- ~10–15 cards is a soft target, not a hard cap. Match the count to the ensemble actually present in the work:
  - **Most standard movies** (single-protagonist, small supporting cast): 8–12.
  - **Standard ensemble shows** (Succession, Yellowstone): around 15.
  - **Sprawling-ensemble movies** — superhero crossovers, heist ensembles (Ocean's Eleven), whodunits (Knives Out), epic trilogy entries (LOTR), Tarantino tapestries — 18–25+. These movies' value to the audience IS the breadth of tracked characters.
  - **Sprawling-ensemble shows** (Game of Thrones, The Wire, Lost): 20–25+ across the season.
- That's fine when every card is a character the audience actively tracks. The criterion is "audience tracks" not "TMDB lists".
- The failure mode is pulling in tertiary characters to pad the list, not refusing to add a 16th genuinely-tracked one. When the work is genuinely sprawling, lean toward the higher end. When in doubt about a borderline character, encode their role as a timeline event + an optional character event on a MAJOR character instead of giving them a card.`;

/** Build the system prompt for a specific generation. The base block
 *  is constant; the edge-case blocks are appended only when the
 *  detector signals they apply. Drops ~250 lines of irrelevant rules
 *  on the typical work (no body swaps, no faction defections, no
 *  age-variant casting), down to ~135 lines of base prompt. */
function buildSystemPrompt(grounding: CompanionGroundingData): string {
  const cases = detectEdgeCases(grounding);
  const edgeCaseBlocks = renderEdgeCasePrompts(cases);
  return edgeCaseBlocks
    ? `${BASE_PROMPT}\n\n${edgeCaseBlocks}`
    : BASE_PROMPT;
}

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
            groupHistory: {
              type: "array",
              description: "Faction/side changes. Empty [] for characters whose faction never changes.",
              items: {
                type: "object",
                properties: {
                  group: { type: "string" },
                  visibleAfter: VISIBLE_AFTER_SCHEMA,
                },
                required: ["group", "visibleAfter"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "actorName", "actorTmdbId", "baseDescription", "group", "visibleAfter", "actors", "nameAliases", "groupHistory"],
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
  episode: number | null = null,
  airing: { eligibleEpisodes: number[] } | null = null,
): Promise<DraftCharacter[]> {
  // Include subtitles — even though baseDescription is identity-only, the
  // actors[] visibleAfter and nameAliases[] visibleAfter fields both need
  // accurate dialogue timestamps. Without subs, Sonnet was guessing reveal
  // times (e.g., Khan's name reveal landed at 85:00 instead of the actual
  // 68:00 in dialogue).
  const userMessage = formatGroundingContext(grounding, season, { episode })
    + formatPriorSeasonCanon(priorCanon)
    + (episode !== null && season !== null ? formatEpisodeModeAddendum(season, episode, "characters") : "")
    + (airing && season !== null ? formatAiringModeAddendum(season, airing.eligibleEpisodes, "characters") : "")
    + `\n\nEmit the characters now. Each must cite an actorTmdbId from the cast list above and include a correct visibleAfter. For multi-actor characters and twist-reveal names, use the DIALOGUE EXCERPT timestamps as ground truth for when each actor/name becomes visible.`;
  const result = await callTool<{ characters: unknown[] }>({
    client,
    systemPrompt: buildSystemPrompt(grounding),
    userMessage,
    tool: TOOL,
    // Bumped from 4096: ensemble movies (Avengers, LOTR) plus
    // multi-actor + nameAliases + groupHistory arrays push character
    // chunks past 4096 of JSON. 8192 stays well within Sonnet 4.6's
    // 64k output ceiling.
    maxTokens: 8192,
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
          const groupHistory: DraftGroupChange[] = Array.isArray((c as DraftCharacter).groupHistory)
            ? ((c as DraftCharacter).groupHistory ?? [])
                .filter((g): g is DraftGroupChange => typeof g === "object" && g !== null && typeof (g as DraftGroupChange).group === "string" && (g as DraftGroupChange).group.length > 0)
                .slice(0, 4)
                .map((g) => ({
                  group: g.group.slice(0, 80),
                  visibleAfter: normVisibleAfter(g.visibleAfter),
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
            groupHistory,
          };
        })
    : [];
}
