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

Aim for ~10–15 characters total (see Quality bar). Each one:

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

## Same actor playing MULTIPLE DISTINCT characters — KEEP SEPARATE

This is the OPPOSITE of the multi-actor rules above. When ONE actor plays MULTIPLE different characters in the story — twins who are both real characters, an actor cast in two unrelated roles, or one actor as many distinct identities (Tatiana Maslany's clones in Orphan Black) — emit ONE character entry PER character. Each card gets the same \`actorName\` and \`actorTmdbId\`, but they're separate entries with separate \`name\`, \`baseDescription\`, \`visibleAfter\`, etc.

The previous rules COLLAPSE many actors into one character (Murph). This rule EXPANDS into many characters who happen to share an actor (Hallie & Annie).

✅ CORRECT (The Parent Trap — Lindsay Lohan plays both twins, who are different people):
\`\`\`
{ name: "Hallie Parker", actorName: "Lindsay Lohan", actorTmdbId: 22226, baseDescription: "...", actors: [], nameAliases: [], ... }
{ name: "Annie James",   actorName: "Lindsay Lohan", actorTmdbId: 22226, baseDescription: "...", actors: [], nameAliases: [], ... }
\`\`\`

✅ CORRECT (Mike & Nick & Nick & Alice — Vince Vaughn plays two Nicks at different points in time):
\`\`\`
{ name: "Nick (Present)", actorName: "Vince Vaughn", actorTmdbId: 6193, ... }
{ name: "Nick (Future)",  actorName: "Vince Vaughn", actorTmdbId: 6193, ... }
\`\`\`

✅ CORRECT (Orphan Black — every clone is its own character, with their own real name):
\`\`\`
{ name: "Sarah Manning",     actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
{ name: "Cosima Niehaus",    actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
{ name: "Alison Hendrix",    actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
{ name: "Helena",            actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
... etc
\`\`\`

❌ WRONG — combining the twins / clones into one entry with two actors[]. They're DIFFERENT characters with DIFFERENT personalities, motivations, and arcs; the audience tracks them separately.

❌ WRONG — naming them "Nick A" / "Nick B" or "Character 1" / "Character 2" when the story offers a real distinguishing context. Always look for a meaningful differentiator: temporal ("Past", "Present", "Future"), occupational ("the Construction Worker", "the Lawyer"), location-based ("the London Nick", "the New York Nick"), or family-based ("the Older Twin", "the Younger Twin"). Generic letter / number suffixes are a last resort, only when the story genuinely gives nothing else to grab onto.

How to tell which rule applies: if the audience is meant to perceive the actor as playing ONE person (Murph at different ages, Michelle Tanner played interchangeably) → consolidate. If the audience perceives the actor as playing SEPARATE people who happen to look the same → split.

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

Sometimes the audience tracks two seemingly separate characters and only later learns they're the same person — Mr. Robot / Elliot Alderson in Mr. Robot, Frank in Donnie Darko. Emit BOTH as separate cards. That mirrors how the audience is meant to perceive them up to the reveal, and the same-actor rule above already covers the actor attribution. Use a fact ("revealed to be a projection of X") rather than collapsing the cards.

## Cover identities, personas, disguises, multiple personalities — KEEP AS ONE character

A character pretending to be someone else is NOT a separate character. If Laszlo Cravensworth poses as "Jackie Daytona" for an episode, that's ONE character (Laszlo) — do NOT emit a separate "Jackie Daytona" card. The audience knows it's still Laszlo.

The same rule applies to undercover cops, spies under cover, characters in disguise, characters using a fake name to escape a past, AND dissociative identity disorder / multiple personalities (Sybil, Split). One body, one card — the alternate identities are facets of the same person, not separate characters. The cover name only goes in \`nameAliases\` if the alias is sustained AND audience-known AND meaningfully part of how viewers refer to the character — most personas don't need an alias entry at all.

❌ WRONG — emitting "Laszlo Cravensworth" AND "Jackie Daytona" as two characters.
❌ WRONG — emitting one card per personality for a DID character.
✅ CORRECT — one card for Laszlo, no alias entry (the persona is a one-bit gag).

## Voice-only, unseen, or non-human characters

Some plot-critical characters are never seen as a human face on-screen: Wilson the volleyball in Cast Away, the Iron Giant, Samantha in Her, GERTY in Moon, HAL 9000 in 2001. Give them a card when they're a major part of the story.

- Voiced characters (Iron Giant, Samantha, GERTY, HAL): \`actorName\` / \`actorTmdbId\` point to the credited voice performer. \`visibleAfter\` anchors to the first audible appearance.
- Silent objects/entities with no credited performer (Wilson the volleyball, R2-D2 in moments where there's no body performer credited, etc.): set \`actorName: null\` and \`actorTmdbId: null\`. The card still tracks their narrative role.

Don't overdo this:

- A kid playing with ten named toys doesn't need ten cards — only a Wilson-tier prop the audience tracks as a character with a personality and arc.
- Pets / animals: only when plot-critical. The talking dog in Absolutely Anything earns a card; the Iron Giant earns a card; a generic golden retriever who shows up to wag its tail is encoded as a fact on the owner's card or a timeline event, not a card.
- Background AI / hologram tools (JARVIS, Cortana, generic ship computer voices) do NOT get cards — they're set dressing. Central AI characters (Samantha in Her, GERTY, HAL) DO get cards.

## Body swaps

When two characters swap bodies mid-story (Freaky Friday, Your Name, 17 Again-style premises), still emit TWO cards — one per consciousness/identity, not per body. Use the existing \`actors[]\` infrastructure to track which actor is portraying that consciousness across the runtime, with \`note\` flagging the swap window.

✅ CORRECT (Freaky Friday — Tess and Anna swap bodies):
\`\`\`
{
  name: "Tess Coleman",
  actorName: "Jamie Lee Curtis",
  actorTmdbId: 6356,
  baseDescription: "Anna's overworked mother, a therapist on the verge of remarriage.",
  visibleAfter: { seconds: 0 },
  actors: [
    { actorName: "Jamie Lee Curtis", actorTmdbId: 6356, note: null, visibleAfter: { seconds: 0 } },
    { actorName: "Lindsay Lohan",    actorTmdbId: 22226, note: "in Anna's body during swap", visibleAfter: { seconds: 1500 } },
    { actorName: "Jamie Lee Curtis", actorTmdbId: 6356, note: "back in own body", visibleAfter: { seconds: 5400 } }
  ],
  nameAliases: []
},
{
  name: "Anna Coleman",
  actorName: "Lindsay Lohan",
  actorTmdbId: 22226,
  baseDescription: "Tess's teenage daughter, a guitarist who feels unseen by her mother.",
  visibleAfter: { seconds: 0 },
  actors: [
    { actorName: "Lindsay Lohan",    actorTmdbId: 22226, note: null, visibleAfter: { seconds: 0 } },
    { actorName: "Jamie Lee Curtis", actorTmdbId: 6356, note: "in Tess's body during swap", visibleAfter: { seconds: 1500 } },
    { actorName: "Lindsay Lohan",    actorTmdbId: 22226, note: "back in own body", visibleAfter: { seconds: 5400 } }
  ],
  nameAliases: []
}
\`\`\`

The viewer renders each card with the actor entries chronologically, so during the swap window the audience sees "currently played by [the other actor] — in [other character]'s body".

## When NOT to create a card — bias toward fewer, denser characters

Most movies and shows yield ~10–15 trackable characters. Beyond that the cast tab gets hectic and the audience can't see the leads. Skip cards for:

- **Narrators** who aren't characters in the story (Ron Howard in Arrested Development). If the narrator IS also a character (Old Rose narrating young Rose in Titanic), use the character's name and treat narration as a fact — don't create a "narrator" card alongside the character card.
- **One-event characters.** If a character's whole role in the movie is a single moment ("the bartender who hears the protagonist's confession", "the lawyer who reads the will"), encode it as a timeline event, and OPTIONALLY also as a character event (fact) on whichever MAJOR character is involved in the scene. Do NOT emit a card for the minor character themselves — they don't need to be tracked across the watch.
- **Implied / never-on-screen characters** (Maris in Frasier, Vera in Cheers). They're a punchline, not a tracked character.
- **Generic crowd / faction members.** Stormtroopers as a group are not characters; specific named ones the audience tracks (FN-2187 → Finn) are.
- **Background pets / animals** without plot weight (covered above under voice-only).

When in doubt, prefer encoding the role as a timeline event and a character event on a MAJOR character, not a separate card for someone with five minutes of screen time.

## Exclude body doubles, acting doubles, stunt performers, stand-ins

\`actorName\` / \`actorTmdbId\` / \`actors[]\` MUST contain ONLY the principal credited actor(s) for the role. Audience-facing performance only. Skip the cast-list entries below — they're production credits, not characters:

- "Body double for X" / "Stunt double for X" / "Acting double for X"
- "Stand-in" / "Photo double"
- "Voice double" UNLESS the entry IS the credited voice for an animated/voice role
- Anyone with "double" in their role label

If the cast list says "Dayleigh Nelson — Acting Double for Nick", IGNORE that entry. Whoever plays Nick on-screen as the lead performance (e.g., Vince Vaughn) is the actor for Nick's card. Mistaking a double for the lead has produced wrong attributions in the past — when in doubt, skip the ambiguous entry rather than guess.

This is especially important when one actor plays multiple distinct characters (the rule above): the cast list often lists doubles as "double for Nick" or "double for Hallie", and those entries can mislead the model into thinking a separate person plays the role. They don't — the lead actor plays both.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Use ONLY information that appears in the grounding data (TMDB cast + overview, Wikipedia summary, episode summaries).
- Aim for ~10–15 characters total. Movies usually land in 8–12; ensemble shows (Succession, Yellowstone, GoT) can go up to 15. Going beyond 15 makes the cast tab hectic and dilutes attention from the leads.
- One-scene minor characters become a timeline event + an optional character event on a MAJOR character — not their own card.`;

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
