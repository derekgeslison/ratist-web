/**
 * Edge-case rule library for the characters chunk.
 *
 * Most works (a rom-com, a thriller, a heist movie) need none of
 * these — the base prompt covers them. The 6 patterns below ARE the
 * tricky ones that have produced wrong drafts in the past, but each
 * one applies only to a specific kind of work. Bundling all six into
 * every system prompt bloated characters.ts past 400 lines and made
 * the model read past mostly-irrelevant rules to find the
 * applicable ones.
 *
 * `detectEdgeCases(grounding)` returns the keys of rules that apply
 * to a given work, derived from a fast keyword pass over the
 * Wikipedia summary, the TMDB overview, and the cast list. The
 * detection errs PERMISSIVE: false positives are cheap (an extra
 * section the model reads and then ignores), false negatives mean
 * missing guidance the model needed (much worse). When unsure, the
 * detector returns the key.
 *
 * Three small / always-relevant sections — twist-reveal names,
 * cover identities, inverse twist — stay in the base prompt because
 * they're hard to detect by keyword without leaking the spoiler,
 * and they're short enough that the cost of always including them
 * is negligible.
 */

import type { CompanionGroundingData } from "../watch-companion-grounding";

export type EdgeCaseKey =
  | "multiActor"
  | "twins"
  | "sameActorMultiple"
  | "factionChanges"
  | "bodySwap"
  | "voiceOnly";

export interface EdgeCase {
  key: EdgeCaseKey;
  /** Block to inject into the system prompt when the case applies. */
  prompt: string;
}

// ──────────────────────────────────────────────────────────────────
// Detection — fast keyword pass over grounding text + cast labels.
// ──────────────────────────────────────────────────────────────────

export function detectEdgeCases(grounding: CompanionGroundingData): Set<EdgeCaseKey> {
  const cases = new Set<EdgeCaseKey>();

  const wikiText = (grounding.wikipedia?.extract ?? "").toLowerCase();
  const overview = (grounding.tmdb && "overview" in grounding.tmdb && typeof grounding.tmdb.overview === "string" ? grounding.tmdb.overview : "").toLowerCase();
  const text = `${wikiText} ${overview}`;

  const castChars = grounding.cast.map((c) => (c.character ?? "").toLowerCase());

  // sameActorMultiple — same actorTmdbId paired with multiple distinct
  // character labels in the cast list. The strongest signal we have:
  // TMDB itself surfaces it (Lindsay Lohan / Tatiana Maslany / Vince
  // Vaughn / etc. all appear with multiple character credits).
  const actorCharCount = new Map<number, Set<string>>();
  for (const c of grounding.cast) {
    if (!c.character) continue;
    let set = actorCharCount.get(c.tmdbId);
    if (!set) { set = new Set(); actorCharCount.set(c.tmdbId, set); }
    set.add(c.character.toLowerCase().trim());
  }
  for (const set of actorCharCount.values()) {
    if (set.size > 1) { cases.add("sameActorMultiple"); break; }
  }

  // multiActor — age variants and recasts. The most reliable signal
  // is cast labels like "Young Murph" / "Adult Murph" / "Old Murph",
  // or roles named "Murph (young)" / "Murph - 10 years old". Wiki
  // text mentioning "as a child" / "in flashbacks" / "decades later"
  // also reads as a multi-actor cue.
  const ageVariantInLabel = castChars.some((c) =>
    /\b(young|younger|older|elderly|adult|child(?:hood)?|teen|teenage|kid)\s+\S/.test(c)
    || /\((young|younger|older|elderly|adult|child|teen)[^)]*\)/.test(c)
    || /\bage[ds]?\s+\d+\b/.test(c)
  );
  if (ageVariantInLabel) cases.add("multiActor");
  if (/\b(in\s+flashbacks?|decades?\s+later|years?\s+later|as\s+a\s+(child|boy|girl)|growing\s+up|throughout\s+the\s+(years|decades))\b/i.test(text)) {
    cases.add("multiActor");
  }

  // bodySwap (covers vessel/avatar/possession too — they share rules)
  if (/\b(swaps?\s+bod|body\s+swap|freaky\s+friday|trapped\s+in\s+\S+\s+body|possess(ed|ion|ing)|inhabits?\s+the\s+body|consciousness\s+(transfer|inhabit)|jumanji|self\s*\/?\s*less|altered\s+carbon|sleeve|avatar)/i.test(text)) {
    cases.add("bodySwap");
  }

  // factionChanges — defections, double agents, hidden allegiance,
  // sleepers. Keyword-driven; the prompt will get included when any
  // of these appear in the grounding text.
  if (/\b(defect(?:s|ed|ion)?|double\s+agent|betray(?:s|ed|al)?|deserter|deserts?\s+the\s+\S+|sleeper\s+agent|secretly\s+work|switch(?:es|ed)?\s+sides?|changes?\s+sides?|hidden\s+allegiance|reveals?\s+(?:his|her|their)\s+(?:true|real)\s+loyalty)/i.test(text)) {
    cases.add("factionChanges");
  }

  // twins (interchangeable co-stars). Genuinely rare. Conservative
  // signals: explicit Olsen mention, or wiki text saying multiple
  // actors share a single role.
  if (/\b(olsen\s+twins?|interchangeable\s+(?:co-?)?stars?|both\s+played\s+by|alternat(?:ed|ing)\s+(?:between|playing))/i.test(text)) {
    cases.add("twins");
  }

  // voiceOnly — animated features and voice-cast members. The wiki
  // summary and overview almost always say "animated film", "voice
  // cast", or "voiced by".
  if (/\b(animated\s+(?:film|movie|series|feature)|voice\s+(?:cast|talent|performance)|voiced\s+by|cgi\s+character)/i.test(text)) {
    cases.add("voiceOnly");
  }

  return cases;
}

// ──────────────────────────────────────────────────────────────────
// Edge-case prompt blocks — verbatim from the previous monolithic
// SYSTEM_PROMPT, just split out so they can be conditionally
// injected. No content changes; only relocation.
// ──────────────────────────────────────────────────────────────────

const MULTI_ACTOR = `## Multi-actor characters (age variants, twins, recasts) — consolidate into ONE character

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

Apply this rule for: Interstellar-style age variants, Dark's triple-casting, It (young-and-adult Losers Club), Titanic (Young Rose / Old Rose), and similar recast patterns.`;

const TWINS = `## Twins / interchangeable co-stars playing ONE role

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

The viewer displays both names side-by-side ("played by Mary-Kate Olsen & Ashley Olsen") because they share the same visibleAfter.`;

const SAME_ACTOR_MULTIPLE = `## Same actor playing MULTIPLE DISTINCT characters — KEEP SEPARATE

This is the OPPOSITE of the multi-actor rules above. When ONE actor plays MULTIPLE different characters in the story — twins who are both real characters, an actor cast in two unrelated roles, or one actor as many distinct identities (Tatiana Maslany's clones in Orphan Black) — emit ONE character entry PER character. Each card gets the same \`actorName\` and \`actorTmdbId\`, but they're separate entries with separate \`name\`, \`baseDescription\`, \`visibleAfter\`, etc.

The previous rules COLLAPSE many actors into one character (Murph). This rule EXPANDS into many characters who happen to share an actor (Hallie & Annie).

✅ CORRECT (The Parent Trap — Lindsay Lohan plays both twins, who are different people):
\`\`\`
{ name: "Hallie Parker", actorName: "Lindsay Lohan", actorTmdbId: 22226, baseDescription: "...", actors: [], nameAliases: [], ... }
{ name: "Annie James",   actorName: "Lindsay Lohan", actorTmdbId: 22226, baseDescription: "...", actors: [], nameAliases: [], ... }
\`\`\`

✅ CORRECT (Orphan Black — every clone is its own character, with their own real name):
\`\`\`
{ name: "Sarah Manning",     actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
{ name: "Cosima Niehaus",    actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
{ name: "Alison Hendrix",    actorName: "Tatiana Maslany", actorTmdbId: 71682, ... }
... etc
\`\`\`

❌ WRONG — combining the twins / clones into one entry with two actors[]. They're DIFFERENT characters with DIFFERENT personalities, motivations, and arcs; the audience tracks them separately.

❌ WRONG — naming them "Nick A" / "Nick B" or "Character 1" / "Character 2" when the story offers a real distinguishing context. Always look for a meaningful differentiator: temporal ("Past", "Present", "Future"), occupational ("the Construction Worker", "the Lawyer"), location-based ("the London Nick", "the New York Nick"), or family-based ("the Older Twin", "the Younger Twin"). Generic letter / number suffixes are a last resort, only when the story genuinely gives nothing else to grab onto.

How to tell which rule applies: if the audience is meant to perceive the actor as playing ONE person (Murph at different ages, Michelle Tanner played interchangeably) → consolidate. If the audience perceives the actor as playing SEPARATE people who happen to look the same → split.`;

const FACTION_CHANGES = `## Group / faction changes (Snape, Finn, sleeper-agent reveals, defections)

When a character's faction/side/allegiance CHANGES during the story — they were a deep-cover double agent, they defect, their hidden loyalty is revealed, they get recruited mid-story — set the primary \`group\` to the AUDIENCE-FACING starting faction (the one fans first see them in) and add an entry to \`groupHistory\` for each subsequent shift. Each entry is \`{ group, visibleAfter }\` where visibleAfter anchors the moment the change becomes audience-known.

This mirrors the \`nameAliases\` mechanic exactly: starting state goes in the primary field, transitions go in a history array gated by visibleAfter. The viewer picks the LATEST unlocked entry's group for color-coding and the faction badge.

Cases that warrant a groupHistory entry:
- **Defections** — Finn deserts the First Order to join the Resistance. \`group: "First Order"\`, \`groupHistory: [{ group: "Resistance", visibleAfter: <defection moment> }]\`.
- **Hidden allegiance reveals** — Snape's Order of the Phoenix loyalty exposed in Deathly Hallows. \`group: "Death Eaters"\`, \`groupHistory: [{ group: "Order of the Phoenix", visibleAfter: <reveal moment> }]\`. (Use the IN-STORY perception arc, not "what fans now know" — Snape reads as Death Eater for almost the whole series.)
- **Sleeper / mole reveals** — a character introduced inside Faction A is revealed mid-show to have always been working for Faction B.
- **Recruitment / inducted into a faction** — a previously unaffiliated character joins a faction (Daenerys's followers, Mad-Eye Moody's recruits). \`group: null\`, \`groupHistory: [{ group: "Order of the Phoenix", visibleAfter: <induction moment> }]\`.
- **Return-to-revert reveals** — a character who appeared aligned with one side, switched to another, and ultimately returned. List EVERY transition in chronological order.

⚠️ Use the AUDIENCE-FACING perception, not the in-fiction truth. Snape was loyal to Dumbledore the whole series, but the AUDIENCE perceives him as a Death Eater until the reveal — so \`group: "Death Eaters"\` and the Order entry goes in groupHistory at the reveal moment. Spoiling the loyalty in the primary \`group\` would defeat the spoiler-gating system.

Cases that DO NOT warrant a groupHistory entry:
- A character's faction stays consistent through the whole story — most characters. Empty array.
- A character is between factions briefly but settles back to the original — only emit transitions the audience tracks as meaningful shifts, not minor scene-level wavering.
- Cover identity / persona switches that aren't faction-level (Laszlo → Jackie Daytona is a name persona, not a faction change). Use nameAliases instead, or skip entirely.

✅ CORRECT (Severus Snape):
\`\`\`
{
  name: "Severus Snape",
  group: "Death Eaters",
  groupHistory: [
    { group: "Order of the Phoenix", visibleAfter: <reveal moment> }
  ]
}
\`\`\`

✅ CORRECT (Finn — Star Wars: The Force Awakens; defects from First Order on screen):
\`\`\`
{
  name: "Finn",
  group: "First Order",
  nameAliases: [
    { name: "FN-2187", visibleAfter: { seconds: 60 } },
    { name: "Finn",    visibleAfter: { seconds: 1500 } }
  ],
  groupHistory: [
    { group: "Resistance", visibleAfter: { seconds: 1500 } }
  ]
}
\`\`\`

The viewer renders the cast card's faction badge based on the LATEST unlocked groupHistory entry (or the primary \`group\` if none have unlocked).`;

const BODY_SWAP = `## Body swaps, vessels, avatars, possession

When two characters swap bodies mid-story (Freaky Friday, Your Name, 17 Again) or a consciousness inhabits a separately-named vessel (Jumanji avatars, possession premises, mind transfers like Self/Less, Avatar's human-Na'vi link), emit ONE card per CONSCIOUSNESS, not per body. Use the existing \`actors[]\` infrastructure to track which actor is portraying that consciousness across the runtime, with \`note\` flagging the swap window.

For a vessel/possession variant: TMDB will list the vessel as a separately-credited character ("Dwayne Johnson as Dr. Smolder Bravestone" alongside "Alex Wolff as Spencer Gilpin"). The cast list is a casting credit, not a character list — collapse them under the consciousness card. For Jumanji the result is FOUR cards (Spencer, Bethany, Fridge, Martha), not eight. The vessel's name goes in \`nameAliases\` with \`visibleAfter\` at the inhabit moment. Inherent traits of the vessel that the consciousness inherits while inside (Bravestone's strength, Mouse's zoology) become facts on the consciousness's card with \`visibleAfter\` at the inhabit moment.

### Always include exit / revert entries — BOTH lists, every time

When the consciousness returns to its original body (end of game in Jumanji, swap reverses in Freaky Friday, possession ends), you MUST add a final entry to BOTH \`actors[]\` AND \`nameAliases\` resetting to the originals.

- \`actors[]\` gets another entry with the ORIGINAL \`actorName\` and \`actorTmdbId\` (matching the card's top-level fields), \`note: "back in own body"\`, and \`visibleAfter\` set to the exit timestamp.
- \`nameAliases\` gets another entry with the ORIGINAL \`name\` (matching the card's top-level \`name\` field) + the same exit \`visibleAfter\`.

A common failure mode: emitting only the \`nameAliases\` revert and forgetting the \`actors[]\` revert. The card then renders "Spencer Gilpin played by Dwayne Johnson" at the end of the movie. The viewer always picks the LATEST unlocked entry from each list independently, so both lists need their own revert entry.

### Use descriptive notes for the swap log

The \`note\` field on each \`actors[]\` entry tells the audience what was happening at that moment in the runtime — "in Bravestone's avatar", "in Ming Fleetfoot's avatar", "back in own body", "young", "adult". For vessel/swap entries that aren't the original-body row, never leave \`note: null\` — that strips the historical context the audience needs to follow a multi-swap movie.

✅ CORRECT (Jumanji: Welcome to the Jungle — Spencer inhabits Bravestone, then exits at the end):
\`\`\`
{
  name: "Spencer Gilpin",
  actorName: "Alex Wolff",
  actorTmdbId: 1284057,
  baseDescription: "An anxious high-schooler who finds confidence inside the game's strongest avatar.",
  visibleAfter: { seconds: 0 },
  actors: [
    { actorName: "Alex Wolff",     actorTmdbId: 1284057, note: null,                          visibleAfter: { seconds: 0 } },
    { actorName: "Dwayne Johnson", actorTmdbId: 18918,   note: "in Bravestone's avatar",      visibleAfter: { seconds: 1100 } },
    { actorName: "Alex Wolff",     actorTmdbId: 1284057, note: "back in own body",            visibleAfter: { seconds: 6000 } }
  ],
  nameAliases: [
    { name: "Dr. Smolder Bravestone", visibleAfter: { seconds: 1100 } },
    { name: "Spencer Gilpin",         visibleAfter: { seconds: 6000 } }
  ]
}
\`\`\`

For multi-swap chains (Jumanji: The Next Level cycles consciousnesses through several vessels), repeat the pattern — each swap is another pair of entries (one in \`actors[]\`, one in \`nameAliases\`) at the swap timestamp. ALWAYS finish with a revert pair at the end of the movie.`;

const VOICE_ONLY = `## Voice-only, unseen, or non-human characters

Some plot-critical characters are never seen as a human face on-screen: Wilson the volleyball in Cast Away, the Iron Giant, Samantha in Her, GERTY in Moon, HAL 9000 in 2001. Give them a card when they're a major part of the story.

- Voiced characters (Iron Giant, Samantha, GERTY, HAL): \`actorName\` / \`actorTmdbId\` point to the credited voice performer. \`visibleAfter\` anchors to the first audible appearance.
- Silent objects/entities with no credited performer (Wilson the volleyball): set \`actorName: null\` and \`actorTmdbId: null\`. The card still tracks their narrative role.

Don't overdo this:
- Pets / animals: only when plot-critical. The talking dog in Absolutely Anything earns a card; a generic golden retriever who shows up to wag its tail is encoded as a fact on the owner's card or a timeline event, not a card.
- Background AI / hologram tools (JARVIS, Cortana, generic ship computer voices) do NOT get cards — they're set dressing. Central AI characters (Samantha in Her, GERTY, HAL) DO get cards.`;

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

const EDGE_CASE_PROMPTS: Record<EdgeCaseKey, string> = {
  multiActor: MULTI_ACTOR,
  twins: TWINS,
  sameActorMultiple: SAME_ACTOR_MULTIPLE,
  factionChanges: FACTION_CHANGES,
  bodySwap: BODY_SWAP,
  voiceOnly: VOICE_ONLY,
};

/** Render the prompt blocks for a set of edge cases, in a stable order
 *  so the system prompt stays deterministic across generations. */
export function renderEdgeCasePrompts(cases: Set<EdgeCaseKey>): string {
  // Stable order = the declaration order on EdgeCaseKey. Don't sort
  // alphabetically; that puts bodySwap before factionChanges which
  // reads less naturally.
  const order: EdgeCaseKey[] = ["multiActor", "twins", "sameActorMultiple", "factionChanges", "bodySwap", "voiceOnly"];
  return order
    .filter((k) => cases.has(k))
    .map((k) => EDGE_CASE_PROMPTS[k])
    .join("\n\n");
}
