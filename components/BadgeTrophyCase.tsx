"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import BadgeCard from "./BadgeCard";
import type { BadgeTier } from "@/lib/badges";
import { TIER_LABELS, TIER_COLORS } from "@/lib/badges";

interface BadgeSummary {
  slug: string;
  name: string;
  icon: string;
  category: string;
  earnedAt: string;
}

interface Props {
  profileFirebaseUid: string;
}

export default function BadgeTrophyCase({ profileFirebaseUid }: Props) {
  const { user } = useAuth();
  const [tier, setTier] = useState<BadgeTier>("none");
  const [earnedCount, setEarnedCount] = useState(0);
  const [badges, setBadges] = useState<BadgeSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const headers: Record<string, string> = {};

    const fetchBadges = async () => {
      if (user) {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/users/${profileFirebaseUid}/badges?summary=1`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setTier(data.tier);
      setEarnedCount(data.earnedCount);
      setBadges(data.badges ?? []);
      setLoaded(true);
    };

    fetchBadges().catch(() => {});
  }, [user, profileFirebaseUid]);

  if (!loaded || earnedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Tier badge */}
      <div
        className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
        style={{
          backgroundColor: `${TIER_COLORS[tier]}20`,
          border: `1.5px solid ${TIER_COLORS[tier]}`,
        }}
        title={`${TIER_LABELS[tier]} — ${earnedCount}/42 badges`}
      >
        <Trophy className="w-3.5 h-3.5" style={{ color: TIER_COLORS[tier] }} />
      </div>

      {/* Recent badges */}
      <div className="flex items-center gap-1.5">
        {badges.map((b) => (
          <BadgeCard
            key={b.slug}
            slug={b.slug}
            name={b.name}
            description=""
            icon={b.icon}
            earned
            earnedAt={b.earnedAt}
            compact
          />
        ))}
      </div>

      {/* View all link */}
      <Link
        href={`/profile/${profileFirebaseUid}/badges`}
        className="flex items-center gap-0.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors ml-1"
      >
        {earnedCount}/42 <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
