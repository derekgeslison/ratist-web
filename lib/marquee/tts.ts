import "server-only";

/**
 * OpenAI TTS wrapper for Marquee.
 *
 * Voice choice: `fable` — the only OpenAI voice with a UK-leaning accent,
 * distinctly male, calm. Closest match to the Jarvis brief Derek asked for.
 * The other male voices (`echo`, `onyx`) read as American.
 *
 * Model: `tts-1` is plenty for a brief. `tts-1-hd` is ~2× slower and only
 * marginally better quality — not worth the latency for a daily brief.
 *
 * No external SDK — single HTTP POST to OpenAI is simpler than adding the
 * `openai` package. Returns base64 audio so the API route can ship it in
 * the same JSON payload as the segment metadata (avoids a second round
 * trip from the client).
 */

// Voice: Marin (calm, considered, neutral British-leaning). One of the
// newer voices that requires the gpt-4o-mini-tts model — the legacy
// tts-1 / tts-1-hd only support the original 6 voices.
//
// Swap candidates if you want to try others: alloy, ash, ballad, cedar,
// coral, fable, marin, nova, onyx, sage, verse. Compare them at
// https://www.openai.fm
export const MARQUEE_VOICE = "marin";
export const MARQUEE_TTS_MODEL = "gpt-4o-mini-tts";

// `instructions` is exclusive to gpt-4o-mini-tts and shapes delivery —
// pace, register, attitude — without affecting word choice. Used here
// to push Marin toward the calm-briefing-aide register we want.
const MARQUEE_TTS_INSTRUCTIONS = `Voice: calm, considered, British-accented male, lightly formal but warm. Pace: measured, never rushed. Attitude: a senior aide giving a morning briefing — dry, occasionally observational, never sycophantic. Think Jarvis from Iron Man.`;

/**
 * Pronunciation overrides applied right before sending text to OpenAI.
 * OpenAI TTS doesn't support SSML or phoneme markup, so we coerce the
 * spelling into something it'll read correctly. The user-visible
 * transcript still shows the original spelling — only the audio gets
 * the respelling.
 *
 * Add new entries as you encounter mispronunciations. Keep patterns
 * word-bounded (\b…\b) to avoid mangling unrelated text.
 */
const PRONUNCIATION_OVERRIDES: Array<[RegExp, string]> = [
  // "Ratist" gets read with a short A ("rat-ist") instead of the
  // intended long A ("rate-ist", rhyming with "rating"). The "ay"
  // digraph reliably triggers /eɪ/ in OpenAI TTS without inserting
  // the awkward pause a hyphenated respelling caused.
  [/\bRatist(s|'s)?\b/gi, (_match: string, suffix: string | undefined) => `Raytist${suffix ?? ""}`] as unknown as [RegExp, string],
];

function applyPronunciationOverrides(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PRONUNCIATION_OVERRIDES) {
    // TS narrowing: the replacement is either string or function; we
    // typed it as string for the array literal, but each entry's actual
    // shape is preserved at runtime.
    out = out.replace(pattern, replacement as never);
  }
  return out;
}

export interface SegmentAudio {
  /** Base64-encoded MP3. Client converts to a Blob URL for <audio>. */
  audioBase64: string;
  /** Approximate duration estimate for UI sequencing; OpenAI doesn't
   *  return one, so we estimate from word count at ~155 wpm (matches the
   *  fable voice's natural pace). Used as a fallback if the client's
   *  metadata-loaded event doesn't fire. */
  estimatedDurationSec: number;
}

export async function synthesizeSegment(prose: string): Promise<SegmentAudio> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MARQUEE_TTS_MODEL,
      voice: MARQUEE_VOICE,
      input: applyPronunciationOverrides(prose),
      // gpt-4o-mini-tts supports a freeform `instructions` field that
      // shapes delivery without affecting word choice (the legacy tts-1
      // model ignored it). Using it to drive the "Jarvis briefing aide"
      // register instead of the older `speed` flag.
      instructions: MARQUEE_TTS_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const buf = await res.arrayBuffer();
  const audioBase64 = Buffer.from(buf).toString("base64");
  const wordCount = prose.split(/\s+/).filter(Boolean).length;
  const estimatedDurationSec = (wordCount / 155) * 60;

  return { audioBase64, estimatedDurationSec };
}

export async function synthesizeAll(segments: { prose: string }[]): Promise<SegmentAudio[]> {
  // Parallel — OpenAI handles concurrent requests fine and we're talking
  // about 10 segments max. Saves ~6-8 seconds end-to-end vs sequential.
  return Promise.all(segments.map((s) => synthesizeSegment(s.prose)));
}
