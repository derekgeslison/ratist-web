"use client";

import Link from "next/link";
import Image from "next/image";
import { Trophy } from "lucide-react";
import { computeTier, TIER_COLORS } from "@/lib/badge-defs";

interface Props {
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  badgeCount: number;
  ratingCount: number;
  isOP?: boolean;
  movieRating?: number | null;
}

export default function AuthorFlair({ firebaseUid, name, avatarUrl, badgeCount, ratingCount, isOP, movieRating }: Props) {
  const tier = computeTier(badgeCount);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <Link href={`/profile/${firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
          {name}
        </Link>
        {isOP && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] font-medium">OP</span>}
        {tier !== "none" && (
          <span title={`${tier} tier`} className="flex items-center">
            <Trophy className="w-3 h-3" style={{ color: TIER_COLORS[tier] }} />
          </span>
        )}
        <span className="text-[10px] text-[var(--foreground-muted)]">{ratingCount} ratings</span>
        {movieRating != null && (
          <span className="text-[10px] text-yellow-400 font-semibold">Rated: {movieRating.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}
