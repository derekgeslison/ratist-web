// Lightweight SRT parser + thinning helpers. The goal is NOT a full-featured
// subtitle editor — we just need to extract timestamped dialogue lines and
// trim the result to something that fits Sonnet's context window.

interface Cue {
  startSeconds: number;
  text: string;
}

function parseTimestamp(timestamp: string): number | null {
  // Matches "HH:MM:SS,ms" or "HH:MM:SS.ms"
  const m = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const secs = parseInt(m[3], 10);
  return hours * 3600 + mins * 60 + secs;
}

function formatCueTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")          // strip HTML tags (<i>, <b>, etc.)
    .replace(/\{[^}]+\}/g, "")         // strip ASS/SSA styling braces
    .replace(/^- /gm, "")              // leading dash for speaker turns — keep on separate lines
    .replace(/\n+/g, " ")              // collapse multi-line cues into one
    .trim();
}

/**
 * Parse an SRT file into (timestamp, text) cues. Ignores cues that fail to
 * parse instead of throwing — sub files from the wild frequently have minor
 * format quirks.
 */
export function parseSrt(raw: string): Cue[] {
  const cues: Cue[] = [];
  // SRT blocks are separated by blank lines. Normalize line endings first.
  const blocks = raw.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    // Block shape:
    //   1
    //   00:01:12,340 --> 00:01:15,120
    //   Subtitle text (1+ lines)
    // Skip the leading cue number line if present.
    let timingLine = lines[0];
    let textStart = 1;
    if (/^\d+$/.test(lines[0])) {
      timingLine = lines[1] ?? "";
      textStart = 2;
    }
    if (!timingLine.includes("-->")) continue;
    const [startRaw] = timingLine.split("-->").map((s) => s.trim());
    const start = parseTimestamp(startRaw);
    if (start === null) continue;
    const text = cleanCueText(lines.slice(textStart).join("\n"));
    if (!text) continue;
    cues.push({ startSeconds: start, text });
  }
  return cues;
}

/**
 * Renders parsed cues as a compact "[M:SS] line" text block. Trims to
 * roughly a target character budget by evenly sampling the cue list — so
 * we keep coverage across the full episode instead of dropping the third
 * act. Cap a single cue's text at 240 chars to avoid one huge monologue
 * eating the whole budget.
 */
export function renderCuesForPrompt(cues: Cue[], maxChars = 18000): string {
  if (cues.length === 0) return "";
  const full = cues.map((c) => `[${formatCueTimestamp(c.startSeconds)}] ${c.text.slice(0, 240)}`);
  const joined = full.join("\n");
  if (joined.length <= maxChars) return joined;

  // Over budget — sample every Nth cue so the act arc survives.
  const stride = Math.ceil(joined.length / maxChars);
  const sampled: string[] = [];
  for (let i = 0; i < full.length; i += stride) {
    sampled.push(full[i]);
  }
  // Second pass: if still too long (very rare), slice by char budget.
  const result = sampled.join("\n");
  return result.length <= maxChars ? result : result.slice(0, maxChars);
}
