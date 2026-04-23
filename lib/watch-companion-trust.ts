// Community trust system for Watch Companion suggestions.
//
// A user is a "critic" when they hold an active Backstage Pass AND have
// submitted 250+ full Ratist ratings (not quick or imported). Critic votes
// carry 3× weight. An admin-level thumbs-down always dismisses.
//
// Auto-approve: weighted net score >= 5, AND either 5+ total votes OR at
// least 1 critic upvote.
// Auto-dismiss: weighted net score <= -3 with 3+ total votes.

import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

export const CRITIC_RATING_THRESHOLD = 250;
export const CRITIC_VOTE_WEIGHT = 3;
export const REGULAR_VOTE_WEIGHT = 1;

export const APPROVE_SCORE_THRESHOLD = 5;
export const APPROVE_MIN_REGULAR_VOTES = 5;
export const DISMISS_SCORE_THRESHOLD = -3;
export const DISMISS_MIN_VOTES = 3;

export async function isCriticUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionExpiry: true,
    },
  });
  if (!user || !isSubscriptionActive(user)) return false;

  // "Full" Ratist ratings: those with plot set (vs. quick/imported). Counts
  // movie + TV series ratings combined.
  const [movieCount, tvCount] = await Promise.all([
    prisma.movieRating.count({ where: { userId, plot: { not: null } } }),
    prisma.tVShowRating.count({ where: { userId, plot: { not: null } } }),
  ]);
  return movieCount + tvCount >= CRITIC_RATING_THRESHOLD;
}

export interface SuggestionScore {
  upvoteScore: number;
  voteCount: number;
  criticUpvotes: number;
  regularVotes: number;
}

export async function recomputeSuggestionScore(suggestionId: string): Promise<SuggestionScore> {
  const votes = await prisma.companionSuggestionVote.findMany({
    where: { suggestionId },
    select: { vote: true, weight: true },
  });
  let upvoteScore = 0;
  let criticUpvotes = 0;
  let regularVotes = 0;
  for (const v of votes) {
    upvoteScore += v.vote * v.weight;
    if (v.vote === 1 && v.weight >= CRITIC_VOTE_WEIGHT) criticUpvotes++;
    if (v.weight < CRITIC_VOTE_WEIGHT) regularVotes++;
  }
  return { upvoteScore, voteCount: votes.length, criticUpvotes, regularVotes };
}

export function shouldAutoApprove(s: SuggestionScore): boolean {
  if (s.upvoteScore < APPROVE_SCORE_THRESHOLD) return false;
  return s.regularVotes >= APPROVE_MIN_REGULAR_VOTES || s.criticUpvotes >= 1;
}

export function shouldAutoDismiss(s: SuggestionScore): boolean {
  return s.upvoteScore <= DISMISS_SCORE_THRESHOLD && s.voteCount >= DISMISS_MIN_VOTES;
}
