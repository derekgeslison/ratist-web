"use client";

import { useState } from "react";
import { Trophy, Award, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { posterUrl } from "@/lib/tmdb";
import type { AwardBodyGroup } from "@/lib/awards";

interface Props {
  awards: AwardBodyGroup[];
}

export default function CelebrityAwardsSection({ awards }: Props) {
  const totalWins = awards.reduce((s, g) => s + g.winCount, 0);
  const totalNoms = awards.reduce((s, g) => s + g.nomCount, 0);

  if (awards.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[var(--ratist-red)]" /> Awards & Nominations
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-amber-400 font-medium">{totalWins} {totalWins === 1 ? "win" : "wins"}</span>
          <span className="text-[var(--foreground-muted)]">{totalNoms} total</span>
        </div>
      </div>

      <div className="space-y-3">
        {awards.map((group) => (
          <AwardBodyCard key={group.slug} group={group} />
        ))}
      </div>
    </section>
  );
}

function AwardBodyCard({ group }: { group: AwardBodyGroup }) {
  const [expanded, setExpanded] = useState(false);
  const preview = group.nominations.slice(0, 3);
  const hasMore = group.nominations.length > 3;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{group.name}</span>
          <span className="text-xs text-[var(--foreground-muted)]">
            {group.winCount > 0 && (
              <span className="text-amber-400">{group.winCount} {group.winCount === 1 ? "win" : "wins"}</span>
            )}
            {group.winCount > 0 && group.nomCount > group.winCount && " · "}
            {group.nomCount > group.winCount && (
              <span>{group.nomCount - group.winCount} nom{group.nomCount - group.winCount !== 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        {hasMore && (
          expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
          )
        )}
      </button>

      {/* Nominations */}
      <div className="border-t border-[var(--border)]">
        {(expanded ? group.nominations : preview).map((nom) => (
          <div
            key={nom.id}
            className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-b-0"
          >
            {/* Win/nom icon */}
            {nom.isWinner ? (
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-[var(--foreground-muted)] shrink-0 opacity-30" />
            )}

            {/* Film poster thumbnail */}
            {nom.forWork?.posterPath && (
              <Link href={`/movies/${nom.forWork.tmdbId}`} className="shrink-0">
                <Image
                  src={posterUrl(nom.forWork.posterPath, "w92")}
                  alt=""
                  width={28}
                  height={42}
                  className="rounded"
                />
              </Link>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`text-xs font-medium ${nom.isWinner ? "text-amber-400" : "text-white"}`}>
                  {nom.categoryName}
                </span>
                {nom.year && (
                  <span className="text-[10px] text-[var(--foreground-muted)]">({nom.year})</span>
                )}
              </div>
              {nom.forWork && (
                <Link
                  href={`/movies/${nom.forWork.tmdbId}`}
                  className="text-[10px] text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
                >
                  {nom.forWork.title}
                </Link>
              )}
            </div>

            {nom.isWinner && (
              <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">
                Won
              </span>
            )}
          </div>
        ))}

        {/* Show more / less toggle */}
        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            Show all {group.nominations.length} &darr;
          </button>
        )}
      </div>
    </div>
  );
}
