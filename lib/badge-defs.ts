// Client-safe badge definitions — no Prisma imports
// Used by both server (lib/badges.ts) and client components

export type BadgeCategory =
  | "watching"
  | "rating"
  | "diary"
  | "exploration"
  | "screening"
  | "community"
  | "personality"
  | "awards"
  | "cineq"
  | "social"
  | "watchlist"
  | "meta";

export type BadgeTier = "none" | "bronze" | "silver" | "gold" | "premiere";

export function computeTier(earnedCount: number): BadgeTier {
  if (earnedCount >= 42) return "premiere";
  if (earnedCount >= 31) return "gold";
  if (earnedCount >= 21) return "silver";
  if (earnedCount >= 10) return "bronze";
  return "none";
}

export const TIER_LABELS: Record<BadgeTier, string> = {
  none: "No Tier",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  premiere: "Premiere",
};

export const TIER_COLORS: Record<BadgeTier, string> = {
  none: "#6b7280",
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  premiere: "#e5e4e2",
};

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  watching: "Watching Milestones",
  rating: "Rating Milestones",
  diary: "Film Diary & Habits",
  exploration: "Exploration",
  screening: "Screening Room",
  community: "Community",
  personality: "Personality & Opinion",
  awards: "Awards & Events",
  cineq: "Cine-Q",
  social: "Social",
  watchlist: "Watchlist",
  meta: "Meta",
};

export const CATEGORY_ORDER: BadgeCategory[] = [
  "watching", "rating", "diary", "exploration", "screening",
  "community", "personality", "awards", "cineq", "social",
  "watchlist", "meta",
];
