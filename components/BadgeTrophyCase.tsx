"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import BadgeCard from "./BadgeCard";
import type { BadgeTier } from "@/lib/badge-defs";
import { TIER_LABELS, TIER_COLORS, TOTAL_BADGES } from "@/lib/badge-defs";

interface BadgeSummary {
  slug: string;
  name: string;
  description: string;
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
    <div className="flex items-center gap-3 mb-3 overflow-x-auto scrollbar-none">
      {/* Tier badge — larger, visually distinct */}
      <div
        className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
        style={{
          backgroundColor: `${TIER_COLORS[tier]}20`,
          border: `2px solid ${TIER_COLORS[tier]}`,
        }}
        title={`${TIER_LABELS[tier]} — ${earnedCount}/${TOTAL_BADGES} badges`}
      >
        <Trophy className="w-5 h-5" style={{ color: TIER_COLORS[tier] }} />
      </div>

      {/* Recent badges — show 3 on mobile, all 5 on sm+ */}
      <div className="flex items-center gap-1.5 shrink-0">
        {badges.map((b, i) => (
          <div key={b.slug} className={i >= 3 ? "hidden sm:block" : ""}>
            <BadgeCard
              slug={b.slug}
              name={b.name}
              description={b.description}
              icon={b.icon}
              earned
              earnedAt={b.earnedAt}
              compact
            />
          </div>
        ))}
      </div>

      {/* View all link */}
      <Link
        href={`/profile/${profileFirebaseUid}/badges`}
        className="flex items-center gap-0.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors ml-1 shrink-0"
      >
        {earnedCount}/{TOTAL_BADGES} <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
