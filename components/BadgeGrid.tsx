"use client";

import BadgeCard from "./BadgeCard";
import type { BadgeTier } from "@/lib/badges";
import { TIER_LABELS, TIER_COLORS } from "@/lib/badges";
import { Trophy } from "lucide-react";

interface BadgeData {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  earned: boolean;
  earnedAt: string | null;
}

interface CategoryData {
  key: string;
  label: string;
}

interface Props {
  badges: BadgeData[];
  categories: CategoryData[];
  tier: BadgeTier;
  earnedCount: number;
  totalCount: number;
}

export default function BadgeGrid({ badges, categories, tier, earnedCount, totalCount }: Props) {
  const percent = Math.round((earnedCount / totalCount) * 100);

  // Next tier info
  const nextTier = tier === "none" ? "bronze" : tier === "bronze" ? "silver" : tier === "silver" ? "gold" : tier === "gold" ? "premiere" : null;
  const nextThreshold = nextTier === "bronze" ? 10 : nextTier === "silver" ? 21 : nextTier === "gold" ? 31 : nextTier === "premiere" ? 42 : null;

  return (
    <div>
      {/* Progress header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: `${TIER_COLORS[tier]}20`, border: `2px solid ${TIER_COLORS[tier]}` }}
          >
            <Trophy className="w-5 h-5" style={{ color: TIER_COLORS[tier] }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {TIER_LABELS[tier]}
            </div>
            <div className="text-xs text-[var(--foreground-muted)]">
              {earnedCount} / {totalCount} badges ({percent}%)
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percent}%`,
              backgroundColor: TIER_COLORS[tier === "none" ? "bronze" : tier],
            }}
          />
        </div>
        {nextTier && nextThreshold && (
          <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
            {nextThreshold - earnedCount} more badge{nextThreshold - earnedCount !== 1 ? "s" : ""} to {TIER_LABELS[nextTier as BadgeTier]}
          </p>
        )}
      </div>

      {/* Badge sections by category */}
      {categories.map((cat) => {
        const catBadges = badges.filter((b) => b.category === cat.key);
        if (catBadges.length === 0) return null;
        return (
          <div key={cat.key} className="mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground-muted)] uppercase tracking-wide mb-3">
              {cat.label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {catBadges.map((badge) => (
                <BadgeCard
                  key={badge.slug}
                  slug={badge.slug}
                  name={badge.name}
                  description={badge.description}
                  icon={badge.icon}
                  earned={badge.earned}
                  earnedAt={badge.earnedAt}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
