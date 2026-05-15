"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scoreColor } from "@/lib/score-color";
import RatingBadge from "./RatingBadge";

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
  /** Optional pre-computed averages — when provided, skip the client
   *  fetch entirely. Used by the show /reviews page (server component)
   *  which already has the prisma aggregate in scope. */
  initialAvg?: CategoryAvg | null;
  /** Custom heading text — defaults to "Community breakdown". Used by
   *  the reviews page to label per-scope variants ("Series breakdown" /
   *  "Season N breakdown"). */
  heading?: string;
  /** Render the overall community ratistRating as a prominent number
   *  above the category bars. Reviews page enables this so each scope
   *  has a clear headline number; detail pages keep it off because the
   *  overall already lives in UserShowPanel / UserMoviePanel. */
  showOverall?: boolean;
  /** Personalized estimate for the current viewer. Rendered next to
   *  the overall when both are present. Reviews page passes this in
   *  (the value comes from a client-side fetch since the page is server-
   *  rendered). */
  estimateForYou?: number | null;
  /** Viewer's own submitted rating for this scope. Takes precedence
   *  over estimateForYou — if you've actually rated this, we show your
   *  rating, not a predicted one. */
  userRating?: number | null;
}

/**
 * Standalone community ratings breakdown. Pulled out of
 * UserMoviePanel/UserShowPanel so it can render full-width below
 * the poster row instead of being squeezed into the right column on
 * mobile. Fetches its own averages from the same seen endpoint the
 * panel uses; the duplicate request is small and the API lookups it
 * resolves to are cached at the DB level.
 */
export default function CommunityBreakdown({ tmdbId, mediaType, initialAvg, heading = "Community breakdown", showOverall = false, estimateForYou = null, userRating = null }: Props) {
  const [avg, setAvg] = useState<CategoryAvg | null>(initialAvg ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialAvg !== undefined) return; // Server already supplied data
    const path = mediaType === "tv" ? `/api/shows/${tmdbId}/seen` : `/api/movies/${tmdbId}/seen`;
    fetch(path)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.communityAvg) setAvg(data.communityAvg);
      })
      .catch(() => null);
  }, [tmdbId, mediaType, initialAvg]);

  if (!avg || avg.count === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{heading}</h3>
        <span className="text-xs text-[var(--foreground-muted)]">
          {avg.count} {avg.count === 1 ? "review" : "reviews"}
        </span>
      </div>
      {showOverall && (avg.ratistRating != null || userRating != null || estimateForYou != null) && (
        <div className="flex items-end gap-6 mb-4 flex-wrap">
          {avg.ratistRating != null && (
            <div className="flex flex-col items-start">
              <RatingBadge type="community" score={avg.ratistRating} size="lg" />
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mt-1">
                community avg
              </span>
            </div>
          )}
          {userRating != null ? (
            <div className="flex flex-col items-start">
              <RatingBadge type="ratist" score={userRating} size="lg" />
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mt-1">
                your rating
              </span>
            </div>
          ) : estimateForYou != null ? (
            <div className="flex flex-col items-start">
              <RatingBadge type="ratist" score={estimateForYou} size="lg" isEstimate />
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mt-1">
                est. for you
              </span>
            </div>
          ) : null}
        </div>
      )}
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
