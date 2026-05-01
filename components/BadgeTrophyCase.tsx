"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Trophy, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import BadgeCard from "./BadgeCard";
import type { BadgeTier } from "@/lib/badge-defs";
import { TIER_LABELS, TIER_COLORS, TOTAL_BADGES } from "@/lib/badge-defs";

// Inclusive thresholds. Mirrors lib/badge-defs#computeTier so the
// "to next tier" hint matches reality.
const TIER_THRESHOLDS: Record<Exclude<BadgeTier, "none">, number> = {
  bronze: 11,
  silver: 22,
  gold: 33,
  premiere: TOTAL_BADGES,
};

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
      {/* Tier medal — tappable on touch to explain what the tier
          means and how far they are from the next one. */}
      <TierMedal tier={tier} earnedCount={earnedCount} />


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

function TierMedal({ tier, earnedCount }: { tier: BadgeTier; earnedCount: number }) {
  const [popOpen, setPopOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!popOpen) return;
    const close = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (buttonRef.current?.contains(target) || popRef.current?.contains(target))) return;
      setPopOpen(false);
    };
    const dismissOnScroll = () => setPopOpen(false);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", dismissOnScroll, { passive: true, once: true });
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", dismissOnScroll);
    };
  }, [popOpen]);

  function openPop() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPopPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    setPopOpen(true);
  }

  // Compute the message about progress to the next tier.
  const tierOrder: BadgeTier[] = ["none", "bronze", "silver", "gold", "premiere"];
  const currentIndex = tierOrder.indexOf(tier);
  const nextTier = currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;
  const nextTierThreshold = nextTier && nextTier !== "none" ? TIER_THRESHOLDS[nextTier] : null;
  const nextTierLabel = nextTier ? TIER_LABELS[nextTier] : null;
  const remaining = nextTierThreshold ? Math.max(0, nextTierThreshold - earnedCount) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (popOpen ? setPopOpen(false) : openPop())}
        aria-expanded={popOpen}
        aria-label={`${TIER_LABELS[tier]} tier — ${earnedCount} of ${TOTAL_BADGES} badges`}
        title={`${TIER_LABELS[tier]} — ${earnedCount}/${TOTAL_BADGES} badges`}
        className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 transition-colors"
        style={{
          backgroundColor: `${TIER_COLORS[tier]}20`,
          border: `2px solid ${TIER_COLORS[tier]}`,
        }}
      >
        <Trophy className="w-5 h-5" style={{ color: TIER_COLORS[tier] }} />
      </button>
      {mounted && popOpen && popPos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[60] -translate-x-1/2 w-60 max-w-[80vw] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3"
          style={{ top: popPos.top, left: popPos.left }}
          role="dialog"
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" style={{ color: TIER_COLORS[tier] }} />
            <p className="text-sm font-semibold text-white">{TIER_LABELS[tier]} tier</p>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {earnedCount} of {TOTAL_BADGES} badges earned
          </p>
          {remaining !== null && nextTierLabel && remaining > 0 && (
            <p className="text-[10px] text-[var(--foreground-muted)] mt-2">
              {remaining} more badge{remaining === 1 ? "" : "s"} to reach {nextTierLabel}.
            </p>
          )}
          {tier === "premiere" && (
            <p className="text-[10px] text-[var(--foreground-muted)] mt-2">All badges earned — top tier.</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
