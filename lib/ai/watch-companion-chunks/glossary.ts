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

const SYSTEM_PROMPT = `You are drafting the GLOSSARY section of a Watch Companion — worldbuilding terms, in-universe jargon, named organizations / factions / objects that a viewer might want defined mid-show.

## Your only job

Emit 10–25 terms for any media with non-trivial worldbuilding. This is NOT optional — an empty or near-empty glossary for a show like Succession, Dune, Suits, Yellowstone is a failure.

- "term" — the exact word/phrase as used on screen ("Bene Gesserit", "proxy battle", "tender offer").
- "definition" — 1–2 sentence explanation in plain English.
- "category": "world" (setting elements), "faction" (houses/organizations), "jargon" (in-universe or specialized real-world vocabulary), "concept" (themes / recurring ideas). Null if unclear.
- "visibleAfter" — when the term is first used or becomes relevant.

**Sort the array most-obscure-first, most-common-last.** A viewer scanning the glossary should hit the things they're most likely confused about at the top.

Examples of glossary-worthy terms:
- **Succession:** proxy battle, tender offer, PGM, ATN, GoJo, Waystar, Eastnet, parliamentary proxy, brass ring, Vaulter, Pierce, poison pill, bear hug, NRPI, shareholder revolt
- **Suits:** junior associate, senior partner, managing partner, disbarment, privilege, retainer, conflict of interest, of counsel, pro bono
- **Dune:** Bene Gesserit, Kwisatz Haderach, Mentat, Fremen, spice, sietch, crysknife, gom jabbar, Sardaukar
- **Yellowstone:** the ranch, the Dutton brand, the train station, the bunkhouse, mending fences, livestock association

Skip only when the media is genuinely plain-vocabulary (most sitcoms, simple romantic comedies). Most prestige TV and adult dramas merit a full glossary.

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
