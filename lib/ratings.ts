// Server-only. This module is the source of truth for the rating
// math, weights, and thresholds that constitute the Ratist algorithm.
// Importing this from a "use client" component would ship trade-secret
// values to every visitor's browser. The `server-only` import (built
// into Next.js App Router) throws at bundle time if the file is
// reached from a client subtree.
//
// Client-safe helpers that USED to live here are now in:
//   lib/score-color.ts        scoreColor()
//
// Anything you add here must remain server-only by construction.
import "server-only";

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
  // Entertainment
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

export function upscaleProfile<T extends Record<string, number>>(profile: T): T {
  const values = Object.values(profile) as number[];
  const max = Math.max(...values);
  if (max <= 0) return profile;
  if (max >= 8.5) return profile;

  const factor = 10 / max;
  return Object.fromEntries(
    Object.entries(profile).map(([k, v]) => [k, Math.round(v * factor * 100) / 100])
  ) as T;
}

export function dimensionSimilarity(a: number, b: number): number {
  return (10 - Math.abs(a - b)) / 10;
}

export function matchScore(similarity: number, preferenceScore: number, genreMode = false): 0 | 1 | 2 {
  const threshold = genreMode ? 7.0 : 7.5;
  if (similarity >= 0.8) {
    return preferenceScore >= threshold ? 2 : 1;
  }
  return 0;
}
