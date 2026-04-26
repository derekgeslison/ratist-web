"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scoreColor } from "@/lib/ratings";

interface CategoryAvg {
  ratistRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
  fields?: Record<string, number | null>;
}

const CATEGORY_FIELDS: { label: string; scoreKey: string; fields: { key: string; label: string }[] }[] = [
  { label: "Story", scoreKey: "storyScore", fields: [
    { key: "plot", label: "Plot" }, { key: "premiseOriginality", label: "Originality" },
    { key: "storytelling", label: "Storytelling" }, { key: "characterDev", label: "Character Dev" },
    { key: "pacingClimax", label: "Pacing" },
  ]},
  { label: "Style", scoreKey: "styleScore", fields: [
    { key: "cinematography", label: "Cinematography" }, { key: "locationCost", label: "Locations" },
    { key: "artisticEffect", label: "Artistic Effect" }, { key: "visualEffects", label: "VFX" },
    { key: "musicSound", label: "Music & Sound" },
  ]},
  { label: "Emotive", scoreKey: "emotiveScore", fields: [
    { key: "overallEmotion", label: "Overall Emotion" }, { key: "relatability", label: "Relatability" },
    { key: "meaning", label: "Meaning" }, { key: "movingness", label: "Movingness" },
  ]},
  { label: "Acting", scoreKey: "actingScore", fields: [
    { key: "casting", label: "Casting" }, { key: "actingQuality", label: "Acting Quality" },
    { key: "dialogueScripting", label: "Dialogue" }, { key: "blockingChoreo", label: "Blocking" },
  ]},
  { label: "Entertainment", scoreKey: "entertainScore", fields: [
    { key: "appeal", label: "Appeal" }, { key: "superficialAllure", label: "Allure" },
    { key: "choreography", label: "Choreography" },
  ]},
];

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

/**
 * Standalone community ratings breakdown. Pulled out of
 * UserMoviePanel/UserShowPanel so it can render full-width below
 * the poster row instead of being squeezed into the right column on
 * mobile. Fetches its own averages from the same seen endpoint the
 * panel uses; the duplicate request is small and the API lookups it
 * resolves to are cached at the DB level.
 */
export default function CommunityBreakdown({ tmdbId, mediaType }: Props) {
  const [avg, setAvg] = useState<CategoryAvg | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const path = mediaType === "tv" ? `/api/shows/${tmdbId}/seen` : `/api/movies/${tmdbId}/seen`;
    fetch(path)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.communityAvg) setAvg(data.communityAvg);
      })
      .catch(() => null);
  }, [tmdbId, mediaType]);

  if (!avg || avg.count === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Community breakdown</h3>
        <span className="text-xs text-[var(--foreground-muted)]">
          {avg.count} {avg.count === 1 ? "review" : "reviews"}
        </span>
      </div>
      <div className="space-y-2">
        {CATEGORY_FIELDS.map(({ label, scoreKey, fields }) => {
          const catScore = (avg as unknown as Record<string, number | null>)[scoreKey];
          if (catScore == null) return null;
          const isOpen = expanded.has(label);
          const fieldData = avg.fields ?? {};
          const hasFields = fields.some((f) => fieldData[f.key] != null);
          return (
            <div key={label}>
              <button
                onClick={() => hasFields && setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(label)) next.delete(label); else next.add(label);
                  return next;
                })}
                className={`flex items-center gap-3 w-full ${hasFields ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-xs text-[var(--foreground-muted)] w-28 sm:w-32 shrink-0 text-left">{label}</span>
                <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(catScore / 10) * 100}%`, backgroundColor: scoreColor(catScore) }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right" style={{ color: scoreColor(catScore) }}>{catScore.toFixed(1)}</span>
                {hasFields && (
                  isOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-[var(--foreground-muted)] shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 text-[var(--foreground-muted)] shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="ml-8 sm:ml-12 mt-1.5 mb-1 space-y-1">
                  {fields.map(({ key, label: fLabel }) => {
                    const val = fieldData[key];
                    if (val == null) return null;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-[10px] text-[var(--foreground-muted)] w-24 shrink-0">{fLabel}</span>
                        <div className="flex-1 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, backgroundColor: scoreColor(val) }} />
                        </div>
                        <span className="text-[10px] font-semibold w-7 text-right" style={{ color: scoreColor(val) }}>{val.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
