/**
 * AI-powered version of backfill-companion-timeline-tags.ts. The plain
 * regex backfill only catches characters whose names already appear in
 * the description verbatim — many timeline events tag characters
 * generically ("Atreides arrive on Arrakis" tags Leto + Jessica + Paul
 * but doesn't mention them by name), so a name-rewrite pass is needed
 * to make every tagged character clickable.
 *
 * Strategy:
 *   1. Scan every CompanionTimelineEvent.
 *   2. Parse existing ((Name)) markers in the description; the IDs
 *      they cover are skipped.
 *   3. If any tagged characterIds remain uncovered, send (description,
 *      uncovered character names) to Haiku 4.5 with instructions to
 *      rewrite the description so each uncovered character is named
 *      explicitly and wrapped in ((Name)) markers, preserving meaning.
 *   4. Defensive validation: the rewritten string must (a) include
 *      every required ((Name)) marker, (b) preserve any pre-existing
 *      markers from step 1, (c) not mangle the original beat. On a
 *      validation failure the event is left alone.
 *   5. Save back to the DB.
 *
 * Run with:
 *   npx tsx --env-file=.env scripts/backfill-companion-timeline-tags-ai.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-companion-timeline-tags-ai.ts --commit # write changes
 *
 * The dry run prints planned rewrites + a token-cost ballpark so you
 * can sanity check before spending tokens.
 */

import { prisma } from "../lib/prisma";
import { getAnthropic } from "../lib/ai/client";

const COMMIT = process.argv.includes("--commit");
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 400;
const CONCURRENCY = 4; // small parallelism to keep the run snappy without DOSing the API

const SYSTEM_PROMPT = `You rewrite single timeline-event descriptions for a movie/TV "Watch Companion" so every tagged character is mentioned by name and wrapped in double parens — \`((Paul Atreides))\`. The viewer turns those markers into clickable pills.

Rules:
- Preserve the original beat. Don't add facts that weren't in the original; don't drop facts that were.
- Each character listed under "Required mentions" MUST appear in the rewritten description, wrapped in ((Full Name)) using the EXACT casing/spelling provided.
- Already-wrapped names in the original should stay wrapped. Don't unwrap.
- Keep the tone neutral and concise — one sentence is usually fine, two if the original was longer.
- Don't editorialize, soften, or sensationalize. No "amazingly", "tragically", etc.
- Output ONLY the rewritten description. No commentary, no preamble, no quotes around the result.`;

interface Plan {
  eventId: string;
  companionId: string;
  before: string;
  uncoveredNames: string[];
  alreadyCovered: string[];
}

// Extract ((Name)) markers and return the set of names found. The
// regex allows one level of nested parens inside the marker so a
// character like "Nick (Future)" wrapped as ((Nick (Future))) parses
// as a single marker with capture "Nick (Future)" instead of stopping
// at the first inner ).
function extractMarkers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\(\(((?:[^()]|\([^()]*\))*)\)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return out;
}

// Check that every required name appears as a ((Name)) marker in the
// rewrite, AND every previously-covered name is still wrapped (the AI
// shouldn't "unwrap" something on us).
function validateRewrite(
  rewrite: string,
  required: string[],
  previouslyCovered: string[],
): { ok: true } | { ok: false; reason: string } {
  if (rewrite.length < 5) return { ok: false, reason: "rewrite too short" };
  const markers = extractMarkers(rewrite);
  for (const name of required) {
    if (!markers.has(name)) return { ok: false, reason: `missing required marker for "${name}"` };
  }
  for (const name of previouslyCovered) {
    if (!markers.has(name)) return { ok: false, reason: `lost previous marker for "${name}"` };
  }
  return { ok: true };
}

// Crude token estimate so the dry-run prints a cost ballpark. Treats
// 4 chars ≈ 1 token; close enough for a sanity check.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function planEvent(eventId: string): Promise<Plan | null> {
  const ev = await prisma.companionTimelineEvent.findUnique({
    where: { id: eventId },
    select: { id: true, companionId: true, seasonNumber: true, description: true, characterIds: true },
  });
  if (!ev || ev.characterIds.length === 0) return null;

  const chars = await prisma.companionCharacter.findMany({
    where: { id: { in: ev.characterIds } },
    select: { id: true, name: true },
  });
  if (chars.length === 0) return null;

  const markersInDesc = extractMarkers(ev.description);
  const alreadyCovered = chars.filter((c) => markersInDesc.has(c.name)).map((c) => c.name);
  const uncoveredNames = chars.filter((c) => !markersInDesc.has(c.name)).map((c) => c.name);

  if (uncoveredNames.length === 0) return null;

  return {
    eventId: ev.id,
    companionId: ev.companionId,
    before: ev.description,
    uncoveredNames,
    alreadyCovered,
  };
}

async function rewriteOne(plan: Plan): Promise<string | null> {
  const client = getAnthropic();
  const userMessage = `Original description:\n"${plan.before}"\n\nRequired mentions (each must appear in the rewrite as ((Name))):\n${plan.uncoveredNames.map((n) => `- ${n}`).join("\n")}${plan.alreadyCovered.length > 0 ? `\n\nAlready wrapped in the original — keep these wrapped:\n${plan.alreadyCovered.map((n) => `- ${n}`).join("\n")}` : ""}`;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const rewrite = block.text.trim().replace(/^"+|"+$/g, ""); // strip stray surrounding quotes if Haiku adds them
    const check = validateRewrite(rewrite, plan.uncoveredNames, plan.alreadyCovered);
    if (!check.ok) {
      console.error(`  validation failed for ${plan.eventId}: ${check.reason}`);
      return null;
    }
    return rewrite;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  AI call failed for ${plan.eventId}: ${msg}`);
    return null;
  }
}

async function main() {
  const events = await prisma.companionTimelineEvent.findMany({
    select: { id: true, characterIds: true, description: true },
  });
  console.log(`Scanning ${events.length} timeline events for missing character mentions…`);

  const plans: Plan[] = [];
  for (const ev of events) {
    if (ev.characterIds.length === 0) continue;
    const plan = await planEvent(ev.id);
    if (plan) plans.push(plan);
  }
  console.log(`${plans.length} event(s) need an AI rewrite.\n`);

  if (plans.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Token-cost estimate (very rough). Haiku 4.5 input = $1/Mtok,
  // output = $5/Mtok at the time of writing. Scale if pricing changes.
  let inTok = 0;
  let outTok = 0;
  for (const p of plans) {
    inTok += estimateTokens(SYSTEM_PROMPT) + estimateTokens(p.before) + estimateTokens(p.uncoveredNames.join("\n")) + 80;
    outTok += estimateTokens(p.before) + 50; // assume rewrite ~ same length
  }
  const cost = (inTok / 1_000_000) * 1 + (outTok / 1_000_000) * 5;
  console.log(`Rough token estimate: ${inTok} in + ${outTok} out — ~$${cost.toFixed(3)} on Haiku 4.5.`);

  // Print a few sample plans so the operator can spot-check.
  for (const p of plans.slice(0, 5)) {
    console.log(`---`);
    console.log(`Event ${p.eventId}`);
    console.log(`Before: ${p.before.slice(0, 200)}`);
    console.log(`Need to add: ${p.uncoveredNames.join(", ")}`);
    if (p.alreadyCovered.length > 0) console.log(`Already wrapped: ${p.alreadyCovered.join(", ")}`);
  }
  console.log(`---`);

  if (!COMMIT) {
    console.log(`\nDry run — re-run with --commit to call the AI and write changes.`);
    return;
  }

  // Run the rewrites with a tiny concurrency pool. Anthropic rate
  // limits + Neon connection limits both prefer this over a 100-deep
  // Promise.all.
  let updated = 0;
  let failed = 0;
  for (let i = 0; i < plans.length; i += CONCURRENCY) {
    const batch = plans.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (p) => {
      const rewrite = await rewriteOne(p);
      if (!rewrite) return { ok: false, plan: p };
      await prisma.companionTimelineEvent.update({
        where: { id: p.eventId },
        data: { description: rewrite },
      });
      return { ok: true, plan: p, rewrite };
    }));
    for (const r of results) {
      if (r.ok && "rewrite" in r && r.rewrite) {
        updated++;
        if (updated <= 5 || updated % 25 === 0) {
          console.log(`[${updated}/${plans.length}] ${r.plan.eventId}`);
          console.log(`   was: ${r.plan.before.slice(0, 140)}`);
          console.log(`   now: ${r.rewrite.slice(0, 140)}`);
        }
      } else {
        failed++;
      }
    }
  }
  console.log(`---`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed (left untouched): ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
