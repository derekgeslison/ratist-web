import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import type { DraftTimelineEvent } from "./shared";

/**
 * Drafts the recap content for the Recap tab. Two Sonnet calls per gen:
 *
 *   1. INSTALLMENT recap — 150-250 words covering ONLY the current
 *      season/movie. The "what just happened in S3" block.
 *
 *   2. SERIES recap — 150-250 words covering EVERYTHING through and
 *      including the current installment. The "remind me what's
 *      happened across the whole show" block. Skipped (returns null)
 *      for the first installment of a series since it'd duplicate the
 *      installment recap.
 *
 * The series recap is informed by prior installments' stored individual
 * recaps (passed in as `priorRecaps`), so quality scales with how many
 * prior installments have already been generated. Missing prior data
 * isn't fatal — the AI still produces a series recap, just leaning on
 * grounding instead of stored prose.
 */

const INSTALLMENT_SYSTEM_PROMPT = `You are drafting an INSTALLMENT recap for a Watch Companion's Recap tab. The audience uses this to refresh memory before watching the next installment — written equivalent of a "previously on" voiceover, ~150-250 words.

## Output

Plain prose. Two paragraphs is fine for dense plots, one for simpler. NO markdown, NO bullets, NO headers — narrative text only.

## Scope

Cover ONLY the current installment (this single movie or this single season). Don't summarize earlier films / earlier seasons — there's a separate SERIES recap that handles the cumulative arc.

## What to include

- Major plot beats (inciting incident, mid-point, climax, resolution)
- Key character arcs — who changed, why, how
- Critical reveals, deaths, betrayals, alliance shifts
- The state things ended in — cliffhanger, surviving characters' positions, unresolved threads
- For TV seasons: this season's main arc; not episode-by-episode

## What to skip

- Setup that doesn't pay off
- Side plots that don't connect to the main story
- Worldbuilding details (the glossary tab covers those)
- Synopses pulled verbatim from TMDB or Wikipedia — paraphrase

## Tone

Neutral and informative. NO "amazingly", "tragically", "shockingly" — describe events, don't editorialize. Don't recommend or rate the work.

## Spoilers

This is gated behind a reveal button. Spoilers are EXPECTED. If a major character dies, say so. The point is "remind me what happened", not "tease me into rewatching".

## Output format

Just the recap prose. No preamble like "Here's the recap" or "Sure!" — start with the first sentence.`;

const SERIES_SYSTEM_PROMPT = `You are drafting a SERIES recap for a Watch Companion's Recap tab. The audience uses this to get caught up on the ENTIRE story so far before watching the next installment — written equivalent of a "previously on the entire series" — ~150-250 words.

## Output

Plain prose, ~150-250 words total. Two paragraphs typical. NO markdown, NO bullets, NO headers — narrative text only.

## Scope

Cover EVERY installment of the series in scope (every prior film / every prior season AND the current one) — but compressed into one cohesive narrative. The reader is NOT going to read 9 separate season recaps; they need the through-line.

You'll receive the previously-drafted recap of each installment in the user message. Use those as the source of truth — don't add events not represented there. Synthesize, don't list.

## How to compress

- Open with the inciting premise of the series
- Walk the audience through the major arc shifts (typically one or two beats per installment)
- Land on the state of things at the end of the current installment
- Skip details that don't survive into later installments — minor villains, dropped subplots, episodic resolutions
- Skip worldbuilding details (the glossary covers those)

## Tone

Neutral, brisk, narrative. NO "amazingly", "tragically", "epically" — describe events. Don't recommend or rate.

## Spoilers

This is gated behind a reveal button. Full spoilers across all installments are expected.

## Output format

Just the recap prose. No preamble like "Here's the series recap" or "Sure!" — start with the first sentence of the recap.`;

export interface RecapResult {
  installment: string;       // recap of the current installment only
  series: string | null;     // recap through and including the current installment; null for the first installment / standalone
}

export interface PriorRecapEntry {
  /** Human label for the AI ("Season 2", "Dune (2021)"). */
  label: string;
  /** The previously-drafted INSTALLMENT recap text. */
  text: string;
}

export async function draftRecap(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  timelineEvents: DraftTimelineEvent[],
  priorRecaps: PriorRecapEntry[],
): Promise<RecapResult> {
  const isMovie = grounding.source === "movie";
  const installmentLabel = isMovie
    ? grounding.title + (grounding.year ? ` (${grounding.year})` : "")
    : `${grounding.title} — Season ${season}`;

  const installment = await draftInstallmentRecap(client, grounding, season, timelineEvents, installmentLabel);

  // Skip the series block when there's nothing to compress against —
  // a standalone movie or S1 has the same content for both, no need
  // for a second AI call or a duplicate UI block.
  if (priorRecaps.length === 0) {
    return { installment, series: null };
  }

  const series = await draftSeriesRecap(client, installmentLabel, installment, priorRecaps);
  return { installment, series };
}

async function draftInstallmentRecap(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  timelineEvents: DraftTimelineEvent[],
  installmentLabel: string,
): Promise<string> {
  const isMovie = grounding.source === "movie";
  const sections: string[] = [];
  sections.push(`TITLE: ${installmentLabel}`);
  if (isMovie && grounding.runtimeSeconds) {
    sections.push(`RUNTIME: ${Math.round(grounding.runtimeSeconds / 60)} minutes`);
  }
  if (grounding.overview) {
    sections.push(`\nTMDB OVERVIEW:\n${grounding.overview}`);
  }
  if (grounding.wikipedia) {
    sections.push(`\nWIKIPEDIA SUMMARY:\n${grounding.wikipedia.extract}`);
  }
  if (!isMovie && grounding.seasons && season !== null) {
    const target = grounding.seasons.find((s) => s.seasonNumber === season);
    if (target?.episodes && target.episodes.length > 0) {
      const epLines = target.episodes
        .map((e) => `- S${season}E${e.episodeNumber} "${e.name}": ${(e.overview ?? "(no summary)").slice(0, 400)}`)
        .join("\n");
      sections.push(`\nSEASON ${season} EPISODES:\n${epLines}`);
    }
  }
  if (grounding.wikipediaEpisodes) {
    sections.push(`\nWIKIPEDIA EPISODE NOTES:\n${grounding.wikipediaEpisodes.slice(0, 3000)}`);
  }
  if (timelineEvents.length > 0) {
    const beatLines = timelineEvents
      .map((t) => {
        const when = isMovie
          ? typeof t.visibleAfter.seconds === "number"
            ? `${Math.floor(t.visibleAfter.seconds / 60)}m`
            : "?"
          : `S${t.visibleAfter.season ?? "?"}E${t.visibleAfter.episode ?? "?"}`;
        return `- [${when}] ${t.description}`;
      })
      .join("\n");
    sections.push(`\nKEY BEATS (from this companion's just-drafted timeline — recap should align):\n${beatLines}`);
  }
  const userMessage = sections.join("\n") + `\n\nWrite the installment recap of ${installmentLabel} now.`;

  return await callForText(client, INSTALLMENT_SYSTEM_PROMPT, userMessage);
}

async function draftSeriesRecap(
  client: Anthropic,
  currentLabel: string,
  currentInstallmentRecap: string,
  priorRecaps: PriorRecapEntry[],
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Series: ${currentLabel.split(" — Season ")[0]}`);
  lines.push(`\nINSTALLMENT RECAPS (chronological — synthesize all of these into one ~150-250 word series recap):`);
  for (const r of priorRecaps) {
    lines.push(`\n## ${r.label}\n${r.text}`);
  }
  lines.push(`\n## ${currentLabel} (current — most recent installment)\n${currentInstallmentRecap}`);
  lines.push(`\nWrite the series recap covering everything through ${currentLabel} now.`);
  return await callForText(client, SERIES_SYSTEM_PROMPT, lines.join("\n"));
}

async function callForText(client: Anthropic, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AI returned no text for recap");
  }
  // Strip preambles + stray surrounding quotes some models still add.
  return block.text
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^(Here['’]s the (installment |series )?recap:?|Sure[,!.]?\s*)/i, "")
    .trim();
}
