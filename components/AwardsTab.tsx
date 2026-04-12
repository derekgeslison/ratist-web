"use client";

import { useState } from "react";
import { Trophy, Award, ChevronDown, ChevronUp } from "lucide-react";
import type { AwardBodyGroup } from "@/lib/awards";

interface Props {
  awards: AwardBodyGroup[];
}

export default function AwardsTab({ awards }: Props) {
  const totalWins = awards.reduce((s, g) => s + g.winCount, 0);
  const totalNoms = awards.reduce((s, g) => s + g.nomCount, 0);

  if (awards.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--foreground-muted)]">
        <Award className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p>No awards data available yet.</p>
        <p className="text-sm mt-1">Awards data will appear after the next sync.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Trophy className="w-5 h-5" />
          <span className="font-semibold">{totalWins} {totalWins === 1 ? "win" : "wins"}</span>
        </div>
        <span className="text-[var(--foreground-muted)]">&middot;</span>
        <div className="text-[var(--foreground-muted)]">
          {totalNoms} {totalNoms === 1 ? "nomination" : "nominations"} total
        </div>
      </div>

      {/* Award body sections */}
      {awards.map((group) => (
        <AwardBodySection key={group.slug} group={group} />
      ))}
    </div>
  );
}

function AwardBodySection({ group }: { group: AwardBodyGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--card-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">{group.name}</span>
          <span className="text-sm text-[var(--foreground-muted)]">
            {group.winCount > 0 && (
              <span className="text-amber-400">{group.winCount} {group.winCount === 1 ? "win" : "wins"}</span>
            )}
            {group.winCount > 0 && group.nomCount > 0 && (
              <span> &middot; </span>
            )}
            <span>{group.nomCount} {group.nomCount === 1 ? "nomination" : "nominations"}</span>
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
        )}
      </button>

      {/* Nominations list */}
      {expanded && (
        <div className="border-t border-[var(--border)]">
          {group.nominations.map((nom) => (
            <div
              key={nom.id}
              className="flex items-start gap-3 px-5 py-3 border-b border-[var(--border)] last:border-b-0"
            >
              {/* Win/nom indicator */}
              {nom.isWinner ? (
                <Trophy className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <Award className="w-4 h-4 text-[var(--foreground-muted)] mt-0.5 shrink-0 opacity-50" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${nom.isWinner ? "text-amber-400" : "text-white"}`}>
                    {nom.categoryName}
                  </span>
                  {nom.year && (
                    <span className="text-xs text-[var(--foreground-muted)]">
                      ({nom.year})
                    </span>
                  )}
                </div>
                {nom.person && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {nom.person.name}
                  </p>
                )}
                {nom.forWork && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    for <span className="italic">{nom.forWork.title}</span>
                  </p>
                )}
                {nom.ceremony && (
                  <p className="text-xs text-[var(--foreground-muted)] opacity-60 mt-0.5">
                    {nom.ceremony}
                  </p>
                )}
              </div>

              {/* Winner badge */}
              {nom.isWinner && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded shrink-0">
                  Won
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
