import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import type { DraftTimelineEvent } from "./shared";

/**
 * Drafts the "what happened previously" recap for the current installment
 * (movie or TV season). Output is plain prose — one or two paragraphs,
 * spoilers freely included since the viewer hides this behind a reveal
 * button. Caller wires the result into the WatchCompanion.recaps JSON
 * field. For TV, the orchestrator merges the returned text into the
 * existing per-season map at the current season's slot, preserving
 * other seasons' recaps.
 *
 * For movies, prior franchise installments' recaps are pulled separately
 * from each prior companion's stored recap (via the viewer fetch path),
 * so this chunk only generates the current movie's text.
 */

const SYSTEM_PROMPT = `You are drafting a RECAP for a Watch Companion. The audience uses this to refresh their memory before watching a sequel or a new season — think of the "previously on" voiceovers at the top of a TV episode, but in written form, ~150–250 words.

## Output

Plain prose. Two paragraphs is fine for dense plots, one paragraph for simpler ones. NO markdown, NO bullet lists, NO headers — just narrative text.

## What to include

- The major plot beats — inciting incident, mid-point, climax, resolution
- Key character arcs — who changed, why, how
- Critical reveals, deaths, betrayals, alliance shifts
- The state things ended in — the cliffhanger, the surviving characters' positions, unresolved threads
- For TV seasons: the season's main story arc; not episode-by-episode

## What to skip

- Setup that doesn't pay off
- Side plots that don't connect to the main story
- Worldbuilding details (the glossary tab covers those)
- Cast / crew / production trivia
- Synopses pulled verbatim from TMDB or Wikipedia — paraphrase

## Tone

Neutral and informative. NO "amazingly", "tragically", "shockingly", "it all comes to a head" — describe the events, don't editorialize. Don't recommend or rate the work.

## Spoilers

This recap is gated behind a reveal button on the viewer. Spoilers are EXPECTED. Don't be coy — if a major character dies, say so. The whole point is "remind me what happened" not "tease me into rewatching".

## Output format

Just the recap prose. No preamble like "Here's the recap" or "Sure!" — start with the first sentence of the recap itself.`;

/**
 * Generate the recap text for the CURRENT installment. For movies the
 * grounding has TMDB + Wikipedia + (optionally) a subtitle excerpt; for
 * TV it has season-level metadata + episode summaries + per-episode
 * subtitle excerpts. We feed all of it plus the just-generated timeline
 * events so the recap aligns with the timeline tab's beats.
 */
export async function draftRecap(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  timelineEvents: DraftTimelineEvent[],
): Promise<string> {
  const isMovie = grounding.source === "movie";
  const installment = isMovie
    ? grounding.title + (grounding.year ? ` (${grounding.year})` : "")
    : `${grounding.title} — Season ${season}`;

  // Build a compact context block. We don't need the full grounding
  // formatter here — just the core synopsis sources + the just-drafted
  // timeline as a "ground truth" beats list.
  const sections: string[] = [];
  sections.push(`TITLE: ${installment}`);
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
  // The just-drafted timeline is our ground truth for what beats matter.
  // Feeding it back keeps the recap aligned with the timeline tab so
  // someone toggling between the two doesn't see contradictory framing.
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

  const userMessage = sections.join("\n") + `\n\nWrite the recap of ${installment} now.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AI returned no text for recap");
  }
  // Strip any stray quote-wrapping or "Here's the recap:" preambles
  // some models can't help adding even when told not to.
  return block.text
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^(Here['’]s the recap:?|Sure[,!.]?\s*)/i, "")
    .trim();
}
