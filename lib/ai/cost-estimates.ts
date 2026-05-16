// Estimated cost per Anthropic API call, by feature. Used by the admin
// AI-usage dashboard to translate raw call counts into $-totals.
//
// These are AVERAGES — actual cost varies by token count. Useful for
// trend-spotting and identifying outlier users; not for accounting.
//
// To recalibrate: pull a week of AiUsageLog rows + the matching Anthropic
// invoice line items, compute the per-feature average, and update here.
// Last calibrated: 2026-05 (rough estimates based on prompt/response sizes
// observed during development).

interface CostEntry {
  /** Estimated USD per call. */
  perCall: number;
  /** Model used. Display-only — helps explain the per-call number. */
  model: string;
}

export const COST_PER_CALL: Record<string, CostEntry> = {
  // Shared AI tools pool — all on Haiku 4.5. ~5-10K input + 500-2000 output.
  recommend: { perCall: 0.012, model: "Haiku 4.5" },
  movies_search: { perCall: 0.008, model: "Haiku 4.5" },
  collection: { perCall: 0.015, model: "Haiku 4.5" },

  // Watch Companion — Sonnet 4.6. ~30K input + 3-5K output per scene chunk.
  // Multi-chunk runs amortize over the whole generation, billed per call here.
  watch_companion_generate: { perCall: 0.20, model: "Sonnet 4.6" },

  // Admin-only Movie Map drafter — Sonnet 4.6. Rough estimate.
  movie_map_draft: { perCall: 0.05, model: "Sonnet 4.6" },
};

/** Default per-call cost for unknown features. Conservative — prefers
 *  over-estimating to keep the dashboard from understating spend. */
const DEFAULT_PER_CALL = 0.01;

export function estimateCallCost(feature: string): number {
  return COST_PER_CALL[feature]?.perCall ?? DEFAULT_PER_CALL;
}

export function estimateTotalCost(byFeature: Record<string, number>): number {
  let total = 0;
  for (const [feature, count] of Object.entries(byFeature)) {
    total += estimateCallCost(feature) * count;
  }
  return total;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString()}`;
}
