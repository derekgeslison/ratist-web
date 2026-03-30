/**
 * Ratist Rating Algorithm
 *
 * Weighted categories:
 *   Story × 5 | Style × 3 | Emotive × 3 | Acting × 3 | Entertainment × 2
 *   Total weight: 16
 *
 * Final: (weighted_base + optional_overall) / 2
 * If no overall provided: weighted_base only
 */

export interface RatingInput {
  // Story
  plot?: number | null;
  premiseOriginality?: number | null;
  storytelling?: number | null;
  characterDev?: number | null;
  pacingClimax?: number | null;
  // Style
  cinematography?: number | null;
  locationCost?: number | null;
  realism?: number | null;
  artisticEffect?: number | null;
  visualEffects?: number | null;
  musicSound?: number | null;
  // Emotive
  overallEmotion?: number | null;
  relatability?: number | null;
  meaning?: number | null;
  movingness?: number | null;
  // Acting
  casting?: number | null;
  actingQuality?: number | null;
  dialogueScripting?: number | null;
  blockingChoreo?: number | null;
  // Entertainment (superficialAllure excluded from score)
  appeal?: number | null;
  choreography?: number | null;
  // Overall (optional)
  overallRating?: number | null;
}

function avg(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export interface ComputedScores {
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  ratistRating: number | null;
}

export function computeRatistScores(input: RatingInput): ComputedScores {
  const storyScore = avg([
    input.plot,
    input.premiseOriginality,
    input.storytelling,
    input.characterDev,
    input.pacingClimax,
  ]);

  const styleScore = avg([
    input.cinematography,
    input.locationCost,
    input.realism,
    input.artisticEffect,
    input.visualEffects,
    input.musicSound,
  ]);

  const emotiveScore = avg([
    input.overallEmotion,
    input.relatability,
    input.meaning,
    input.movingness,
  ]);

  const actingScore = avg([
    input.casting,
    input.actingQuality,
    input.dialogueScripting,
  ]);

  const entertainScore = avg([input.appeal, input.choreography]);

  // Need at least story and one other category to compute a rating
  const hasEnough = storyScore != null && (styleScore != null || emotiveScore != null);
  if (!hasEnough) {
    return { storyScore, styleScore, emotiveScore, actingScore, entertainScore, ratistRating: null };
  }

  const weights = [
    { score: storyScore, weight: 5 },
    { score: styleScore, weight: 3 },
    { score: emotiveScore, weight: 3 },
    { score: actingScore, weight: 3 },
    { score: entertainScore, weight: 2 },
  ];

  let weightedSum = 0;
  let totalWeight = 0;
  for (const { score, weight } of weights) {
    if (score != null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  const weightedBase = weightedSum / totalWeight;
  const ratistRating =
    input.overallRating != null
      ? (weightedBase + input.overallRating) / 2
      : weightedBase;

  return {
    storyScore,
    styleScore,
    emotiveScore,
    actingScore,
    entertainScore,
    ratistRating: Math.round(ratistRating * 100) / 100,
  };
}

/** Color for a score 0-10: green (high) → yellow → red (low) */
export function scoreColor(score: number): string {
  if (score >= 8) return "#22c55e";   // green-500
  if (score >= 6) return "#eab308";   // yellow-500
  if (score >= 4) return "#f97316";   // orange-500
  return "#ef4444";                    // red-500
}

/** Upscale profile scores so max = 10 when no strong signals exist */
export function upscaleProfile<T extends Record<string, number>>(profile: T): T {
  const values = Object.values(profile) as number[];
  const max = Math.max(...values);
  if (max <= 0) return profile;
  if (max >= 8.5) return profile; // already strong, no upscaling needed

  const factor = 10 / max;
  return Object.fromEntries(
    Object.entries(profile).map(([k, v]) => [k, Math.round(v * factor * 100) / 100])
  ) as T;
}

/** Similarity between two users on a single dimension (0-1) */
export function dimensionSimilarity(a: number, b: number): number {
  return (10 - Math.abs(a - b)) / 10;
}

/** Match score: 2 = strong, 1 = weak, 0 = no match */
export function matchScore(similarity: number, preferenceScore: number, genreMode = false): 0 | 1 | 2 {
  const threshold = genreMode ? 7.0 : 7.5;
  if (similarity >= 0.8) {
    return preferenceScore >= threshold ? 2 : 1;
  }
  return 0;
}
