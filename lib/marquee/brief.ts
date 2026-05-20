import "server-only";
import { getAnthropic } from "@/lib/ai/client";
import type { MarqueeData } from "./aggregators";
import { selectTopicCandidates, type TopicCandidate, type TopicTile } from "./candidates";

/**
 * Marquee brief generator — selects the day's most noteworthy topics
 * dynamically, then asks Claude to write structured audio-ready segments.
 *
 * Output: intro + 5-8 selected segments + outro. Each dynamic segment's
 * `section` key matches one of the tile section keys, so the page can
 * highlight the corresponding HUD tile while that segment plays.
 *
 * The page also receives the full tile list (selected + unselected
 * permanents + active ephemerals) so the HUD grid renders dynamically.
 */

export interface MarqueeSegment {
  section: string;
  prose: string;
}

export interface MarqueeBrief {
  segments: MarqueeSegment[];
  tiles: TopicTile[];
  /** Section keys of the segments selected for the brief, in order.
   *  The page uses this to sort tiles (selected first). */
  selectedSections: string[];
  data: MarqueeData;
}

const SYSTEM_PROMPT = `You are Marquee — the in-house briefing voice for The Ratist (a movie & TV rating platform). Each morning the owner (Derek) opens his admin dashboard and asks you for the day's brief. You respond with a short, conversational synopsis in British English, formal-but-warm, like a senior aide briefing a CEO. Think Jarvis from Iron Man — calm, dry, occasionally observational, never sycophantic.

Style rules:
- Speak in the second person ("you" = Derek).
- Use specific numbers. "Twelve" not "a handful".
- One short sentence per data point unless context warrants two.
- Don't read raw labels. Translate "Watch Companions: 18 this week" into natural prose.
- Use natural connective tissue between segments ("On the community side…", "Worth flagging…").
- Lead with what matters most. Sections are pre-ranked by noteworthiness — the first body section is the most important thing to call out.
- The intro is one short line of warm greeting + frame ("Morning, Derek. Three things worth your time today.").
- The outro is one short line of close/sign-off ("That's the picture. Holler if you'd like a deeper look at anything.").

Input shape: you'll get a JSON list of pre-selected topics, each with a section key, a data payload, and a "reason" hint explaining why it's noteworthy. Write one segment per topic in the given order, plus the intro + outro that frame them.

You MUST respond with ONLY valid JSON matching this exact shape (no markdown, no prose outside the JSON):

{
  "segments": [
    { "section": "intro", "prose": "..." },
    { "section": "<topic-section-key>", "prose": "..." },
    ...one entry per provided topic, in the order given...
    { "section": "outro", "prose": "..." }
  ]
}

Each topic-segment's "section" key MUST match the section key from the input topic exactly. Don't invent sections, don't skip topics, don't reorder them.`;

function buildUserPrompt(data: MarqueeData, topics: TopicCandidate[]): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" });
  const topicsBlock = topics.map((t, i) => `
TOPIC ${i + 1} — section: "${t.section}"
Why this matters: ${t.reason}
Data: ${JSON.stringify(t.data)}
`).join("\n");

  return `Today is ${today}. ${topics.length} topics have been pre-selected for today's brief, ranked by noteworthiness. Write the intro, one segment per topic, and the outro.

${topicsBlock}

Now produce the briefing JSON.`;
}

export async function generateMarqueeBrief(data: MarqueeData): Promise<MarqueeBrief> {
  const { selected, tiles } = await selectTopicCandidates(data);

  const client = getAnthropic();
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(data, selected) }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let parsed: { segments?: Array<{ section: string; prose: string }> } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      segments: [
        { section: "intro", prose: "I'm afraid I couldn't compile a brief — the briefing generator returned something I couldn't parse. Worth checking the logs." },
      ],
    };
  }

  const segments: MarqueeSegment[] = (parsed.segments ?? [])
    .filter((s): s is { section: string; prose: string } => !!s && typeof s.section === "string" && typeof s.prose === "string");

  return {
    segments,
    tiles,
    selectedSections: selected.map((c) => c.section),
    data,
  };
}
