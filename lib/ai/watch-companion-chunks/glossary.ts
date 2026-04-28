import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftGlossaryTerm,
  type PriorSeasonCanon,
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  formatGroundingContext,
  formatPriorSeasonCanon,
  formatEpisodeModeAddendum,
  formatAiringModeAddendum,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the GLOSSARY section of a Watch Companion — worldbuilding terms, in-universe jargon, named organizations / places / objects / events / concepts that a viewer might want defined mid-show.

## Your only job

Emit 10–25 terms for any media with non-trivial worldbuilding. This is NOT optional — an empty or near-empty glossary for a show like Succession, Dune, Suits, Yellowstone is a failure.

- "term" — the exact word/phrase as used on screen ("Bene Gesserit", "proxy battle", "tender offer", "Wakanda").
- "definition" — 1–2 sentence explanation in plain English.
- "category": one of the 7 below, or null if genuinely unclear.
- "visibleAfter" — when the term is first used or becomes relevant.

## Categories (pick the most specific fit)

- **"world"** — setting-level lore that doesn't fit one of the more specific categories. The general state of the world, time period framing, cosmology. (Examples: "the post-Snap world", "the Sokovia Accords era", "the Star Wars galaxy".)
- **"faction"** — organizations, houses, teams, agencies, governments. **Always a group, never an individual.** (Examples: "Avengers", "S.H.I.E.L.D.", "Death Eaters", "Bene Gesserit", "House Atreides", "Goldman Sachs".)
- **"place"** — named locations: cities, planets, buildings, regions, headquarters. (Examples: "Wakanda", "Asgard", "Sokovia", "Sanctum Sanctorum", "Westeros", "the Pierce estate".)
- **"object"** — named items, artifacts, weapons, devices, vehicles. (Examples: "Tesseract", "Mjolnir", "Vibranium shield", "Iron Man suit", "the One Ring", "spice".)
- **"event"** — named happenings the audience references back to: battles, disasters, ceremonies, historical moments. (Examples: "the Snap", "the Battle of New York", "the Decimation", "the Red Wedding", "the Trinity test".)
- **"jargon"** — in-universe vocabulary or specialized real-world terms. (Examples: "Kwisatz Haderach", "proxy battle", "tender offer", "of counsel", "gom jabbar", "PGM".)
- **"concept"** — themes, recurring ideas, abstract principles. (Examples: "the Force", "the Dark Side", "Manifest Destiny", "the long night", "the Way".)

## Do NOT include people in the glossary

People — characters, real or fictional, individual humans/aliens/entities — **never go in the glossary.** Their home is one of:
- Important to the story → CHARACTER CARD (the characters chunk handles those).
- One-scene supporting role → encode as a fact on whichever main character interacted with them, OR as a timeline event ("Lawyer reads Kane's will at 1:42:00"). The characters chunk has explicit guidance for these.

If you're tempted to add an entry for a person — Tony Stark, Pepper Potts, Hawkeye, Strauss, anyone — STOP. They get a card or a timeline event, never a glossary term. Mis-categorizing people as "faction" was the prior pipeline's #1 glossary failure.

The faction category is for GROUPS only. "Avengers" yes, "Tony Stark" no. "House Atreides" yes, "Paul Atreides" no.

**Sort the array most-obscure-first, most-common-last.** A viewer scanning the glossary should hit the things they're most likely confused about at the top.

## Examples of glossary-worthy terms

- **Succession:** proxy battle, tender offer, PGM, ATN, GoJo, Waystar, Eastnet, parliamentary proxy, brass ring, Vaulter, Pierce, poison pill, bear hug, NRPI, shareholder revolt
- **Suits:** junior associate, senior partner, managing partner, disbarment, privilege, retainer, conflict of interest, of counsel, pro bono
- **Dune:** Bene Gesserit, Kwisatz Haderach, Mentat, Fremen, spice, sietch, crysknife, gom jabbar, Sardaukar, Arrakis, Caladan, House Atreides, House Harkonnen
- **Yellowstone:** the ranch, the Dutton brand, the train station, the bunkhouse, mending fences, livestock association
- **MCU (Endgame-era):** Avengers, S.H.I.E.L.D., Wakanda, Asgard, Tesseract, Mjolnir, Vibranium, Quantum Realm, the Snap, the Decimation, Sokovia Accords, Infinity Stones

None of these examples are people — every one is a faction, place, object, event, jargon term, or concept.

Skip glossary entirely only when the media is genuinely plain-vocabulary (most sitcoms, simple romantic comedies). Most prestige TV and adult dramas merit a full glossary.

Only glossary terms. Don't emit characters, facts, relationships, or timeline events.

${VISIBLE_AFTER_GUIDANCE}`;

const TOOL: Anthropic.Tool = {
  name: "emit_glossary",
  description: "Emit the glossary for a Watch Companion. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      terms: {
        type: "array",
        items: {
          type: "object",
          properties: {
            term: { type: "string" },
            definition: { type: "string" },
            category: { type: ["string", "null"], enum: [...GLOSSARY_CATEGORIES, null] },
            visibleAfter: VISIBLE_AFTER_SCHEMA,
          },
          required: ["term", "definition", "category", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["terms"],
    additionalProperties: false,
  },
};

export async function draftGlossary(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  priorCanon: PriorSeasonCanon | null = null,
  episode: number | null = null,
  airing: { eligibleEpisodes: number[] } | null = null,
): Promise<DraftGlossaryTerm[]> {
  const userMessage = formatGroundingContext(grounding, season, { includeCast: false, episode })
    + formatPriorSeasonCanon(priorCanon)
    + (episode !== null && season !== null ? formatEpisodeModeAddendum(season, episode, "glossary") : "")
    + (airing && season !== null ? formatAiringModeAddendum(season, airing.eligibleEpisodes, "glossary") : "")
    + `\n\nEmit the glossary now. Sort most-obscure-first. ${episode !== null && season !== null ? "0–6 NEW terms for a single episode is typical — most episodes only introduce a handful of new jargon, if any." : "Aim for 10–25 terms for prestige / worldbuilding-heavy media."}`;

  const result = await callTool<{ terms: unknown[] }>({
    client,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tool: TOOL,
    maxTokens: 4096,
  });

  return Array.isArray(result.terms)
    ? result.terms
        .filter((g): g is DraftGlossaryTerm => typeof g === "object" && g !== null
          && typeof (g as DraftGlossaryTerm).term === "string"
          && typeof (g as DraftGlossaryTerm).definition === "string")
        .slice(0, 30)
        .map((g) => ({
          term: g.term.slice(0, 80),
          definition: g.definition.slice(0, 500),
          category: typeof g.category === "string" && (GLOSSARY_CATEGORIES as readonly string[]).includes(g.category) ? (g.category as GlossaryCategory) : null,
          visibleAfter: normVisibleAfter(g.visibleAfter),
        }))
    : [];
}
