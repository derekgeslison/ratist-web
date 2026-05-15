"use client";

import { scoreColor } from "@/lib/score-color";

interface ScreeningRatingData {
  id: string;
  userId: string;
  reviewType: string;
  overallRating: number | null;
  ratistRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  reviewText: string | null;
  user: { id: string; name: string; avatarUrl: string | null };
}

interface Props {
  ratings: ScreeningRatingData[];
  tmdbId: number | null;
  myUserId: string;
}

const CATEGORIES = [
  { key: "storyScore", label: "Story" },
  { key: "styleScore", label: "Style" },
  { key: "emotiveScore", label: "Emotion" },
  { key: "actingScore", label: "Acting" },
  { key: "entertainScore", label: "Entertainment" },
];

function ScoreBar({ score, maxWidth = 100 }: { score: number | null; maxWidth?: number }) {
  if (score == null) return <span className="text-[10px] text-[var(--foreground-muted)]">—</span>;
  const pct = (score / 10) * maxWidth;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[var(--surface)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: scoreColor(score) }} />
      </div>
      <span className="text-xs font-bold min-w-[30px] text-right" style={{ color: scoreColor(score) }}>{score.toFixed(1)}</span>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

export default function ScreeningRatingCompare({ ratings, tmdbId, myUserId }: Props) {
  if (ratings.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center">No ratings submitted yet.</p>;
  }

  // Group averages
  const avgOverall = avg(ratings.map((r) => r.ratistRating ?? r.overallRating));
  const avgStory = avg(ratings.map((r) => r.storyScore));
  const avgStyle = avg(ratings.map((r) => r.styleScore));
  const avgEmotion = avg(ratings.map((r) => r.emotiveScore));
  const avgActing = avg(ratings.map((r) => r.actingScore));
  const avgEntertain = avg(ratings.map((r) => r.entertainScore));
  const groupAvgs = [
    { label: "Story", score: avgStory },
    { label: "Style", score: avgStyle },
    { label: "Emotion", score: avgEmotion },
    { label: "Acting", score: avgActing },
    { label: "Entertainment", score: avgEntertain },
  ];

  return (
    <div className="space-y-6">
      {/* Group average + individual scores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {/* Group average card */}
        {ratings.length > 1 && avgOverall != null && (
          <div className="bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-lg p-4 text-center">
            <p className="text-xs text-[var(--ratist-red)] mb-1 font-medium">Group Average</p>
            <p className="text-2xl font-bold" style={{ color: scoreColor(avgOverall) }}>
              {avgOverall.toFixed(1)}
            </p>
          </div>
        )}
        {/* Individual scores */}
        {ratings.map((r) => (
          <div key={r.userId} className="bg-[var(--surface-2)] rounded-lg p-4 text-center">
            <p className="text-xs text-[var(--foreground-muted)] mb-1 truncate">{r.user.name}</p>
            <p className="text-2xl font-bold" style={{ color: r.ratistRating ? scoreColor(r.ratistRating) : "white" }}>
              {r.ratistRating?.toFixed(1) ?? r.overallRating?.toFixed(1) ?? "—"}
            </p>
            <p className="text-[9px] text-[var(--foreground-muted)] mt-0.5">{r.reviewType === "basic" ? "Quick" : "Ratist"}</p>
          </div>
        ))}
      </div>

      {/* Group category averages */}
      {groupAvgs.some((g) => g.score != null) && (
        <div className="bg-[var(--ratist-red)]/5 border border-[var(--ratist-red)]/20 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[var(--ratist-red)] mb-3">Group Category Averages</h3>
          <div className="grid grid-cols-5 gap-3">
            {groupAvgs.map((g) => (
              <div key={g.label} className="text-center">
                <p className="text-[10px] text-[var(--foreground-muted)] mb-1">{g.label}</p>
                <p className="text-sm font-bold" style={{ color: g.score ? scoreColor(g.score) : "#555" }}>
                  {g.score?.toFixed(1) ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown comparison */}
      {ratings.some((r) => r.reviewType === "standard") && (
        <div className="bg-[var(--surface-2)] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-white mb-4">Category Breakdown</h3>
          <div className="space-y-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <p className="text-[10px] text-[var(--foreground-muted)] mb-1.5">{cat.label}</p>
                <div className="space-y-1.5">
                  {ratings.filter((r) => r.reviewType === "standard").map((r) => (
                    <div key={r.userId} className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--foreground-muted)] w-20 truncate">{r.user.name}</span>
                      <div className="flex-1">
                        <ScoreBar score={(r as any)[cat.key]} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review comments */}
      {ratings.some((r) => r.reviewText) && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-white">Comments</h3>
          {ratings.filter((r) => r.reviewText).map((r) => (
            <div key={r.userId} className="bg-[var(--surface-2)] rounded-lg p-3">
              <p className="text-xs font-medium text-white mb-1">{r.user.name}</p>
              <p className="text-xs text-[var(--foreground-muted)] italic">&ldquo;{r.reviewText}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {/* Post as review button */}
      {tmdbId && (() => {
        const myRating = ratings.find((r) => r.userId === myUserId);
        if (!myRating) return null;
        return (
          <div className="text-center pt-2">
            <button
              onClick={() => {
                // Store rating data in sessionStorage for prefill
                sessionStorage.setItem(`screening-prefill-${tmdbId}`, JSON.stringify(myRating));
                window.open(`/movies/${tmdbId}/rate`, "_blank");
              }}
              className="inline-block bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-xs font-medium px-5 py-2.5 rounded-lg transition-colors">
              Post as My Official Review
            </button>
            <p className="text-[10px] text-[var(--foreground-muted)] mt-1">Your ratings will pre-fill the review form — you can make changes before publishing</p>
          </div>
        );
      })()}
    </div>
  );
}
