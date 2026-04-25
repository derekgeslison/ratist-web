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
 * The series recap is informed by EVERY prior installment in the series,
 * regardless of whether earlier companions have been generated. Two
 * input lists drive this:
 *
 *   - `priorRecaps`: prior installments that already have a stored
 *     INSTALLMENT recap (from an earlier gen). Full text, used as the
 *     source of truth for those installments.
 *
 *   - `priorMissing`: prior installments that don't have a stored recap
 *     yet. Only the label and a TMDB overview blurb are passed; the AI
 *     fills in the arc from training-data knowledge. Without this list
 *     the series recap would silently skip whole installments whenever
 *     a user generated S5 before S2/3/4 — leaving holes in the through-
 *     line. Now every prior installment is represented either by stored
 *     prose or by an AI-summarized gap-fill.
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

Cover EVERY installment of the series in chronological order (every prior film / every prior season AND the current one) — compressed into one cohesive narrative. The reader is NOT going to read N separate recaps; they need the through-line.

## Two input sources for prior installments

The user message splits prior installments into two groups:

  1. PRIOR INSTALLMENT RECAPS — installments that already have a recap drafted. Full text is provided. Treat these as the source of truth for those installments; do not add events that aren't represented.

  2. PRIOR INSTALLMENTS WITHOUT STORED RECAPS — installments that haven't been drafted yet. Only a label and a brief TMDB overview blurb are provided. The TMDB overview is a marketing synopsis, NOT the plot — use your own training-data knowledge of these works to summarize their major arc, then cross-check that it fits with the overview.

Cover BOTH groups in your recap. The reader doesn't care about your sources — they want a smooth, continuous chronological recap that doesn't have a gap where one installment is skipped. DO NOT call attention to which installments had stored recaps vs. which you reconstructed from training knowledge. DO NOT say things like "the third film was not provided" — just write the through-line as if you know all of it.

If you don't recognize an installment in group 2 from training data, lean on the TMDB overview and write a single neutral sentence about it rather than skipping or speculating.

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

export interface PriorMissingEntry {
  /** Human label for the AI ("Season 2", "Dune (2021)"). */
  label: string;
  /** TMDB synopsis blurb if available — marketing copy, not full plot. */
  tmdbOverview: string | null;
  /** Optional release year, used by movie franchises. Null for TV seasons. */
  year: number | null;
}

export async function draftRecap(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  timelineEvents: DraftTimelineEvent[],
  priorRecaps: PriorRecapEntry[],
  priorMissing: PriorMissingEntry[],
): Promise<RecapResult> {
  const isMovie = grounding.source === "movie";
  const installmentLabel = isMovie
    ? grounding.title + (grounding.year ? ` (${grounding.year})` : "")
    : `${grounding.title} — Season ${season}`;

  const installment = await draftInstallmentRecap(client, grounding, season, timelineEvents, installmentLabel);

  // Skip the series block when nothing is prior — standalone movie or
  // S1 with no earlier installments. Nothing to compress against.
  if (priorRecaps.length === 0 && priorMissing.length === 0) {
    return { installment, series: null };
  }

  const series = await draftSeriesRecap(client, installmentLabel, installment, priorRecaps, priorMissing);
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

export async function draftSeriesRecap(
  client: Anthropic,
  currentLabel: string,
  currentInstallmentRecap: string,
  priorRecaps: PriorRecapEntry[],
  priorMissing: PriorMissingEntry[],
): Promise<string> {
  const lines: string[] = [];
  const seriesTitle = currentLabel.split(" — Season ")[0];
  lines.push(`Series: ${seriesTitle}`);

  if (priorRecaps.length > 0) {
    lines.push(`\n=== PRIOR INSTALLMENT RECAPS (full text — source of truth for these installments) ===`);
    for (const r of priorRecaps) {
      lines.push(`\n## ${r.label}\n${r.text}`);
    }
  }

  if (priorMissing.length > 0) {
    lines.push(`\n=== PRIOR INSTALLMENTS WITHOUT STORED RECAPS (use your training-data knowledge of these works to summarize them; the TMDB overview is a marketing blurb, not the plot) ===`);
    for (const m of priorMissing) {
      const overview = m.tmdbOverview ? `\n  TMDB overview: ${m.tmdbOverview}` : "";
      lines.push(`\n## ${m.label}${overview}`);
    }
  }

  lines.push(`\n=== CURRENT INSTALLMENT (just drafted — most recent) ===`);
  lines.push(`\n## ${currentLabel}\n${currentInstallmentRecap}`);
  lines.push(`\nWrite the series recap covering everything through ${currentLabel} in chronological order. Cover every prior installment from BOTH groups above plus the current one.`);
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
