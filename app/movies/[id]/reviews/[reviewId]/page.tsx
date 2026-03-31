import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";
import ReviewCard from "@/components/ReviewCard";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com";

const FIELD_LABELS: Record<string, string> = {
  plot: "Plot", premiseOriginality: "Premise / Originality", storytelling: "Storytelling",
  characterDev: "Character Development", pacingClimax: "Pacing / Climax",
  cinematography: "Cinematography", locationCost: "Location & Costuming",
  realism: "Realism", artisticEffect: "Artistic Effect",
  visualEffects: "Visual Effects", musicSound: "Music & Sound",
  overallEmotion: "Overall Emotion", relatability: "Relatability",
  meaning: "Meaning / Message", movingness: "Movingness",
  casting: "Casting", actingQuality: "Acting Quality",
  dialogueScripting: "Dialogue", blockingChoreo: "Choreography",
  appeal: "Appeal", superficialAllure: "Superficial Allure", choreography: "Choreography",
};

const CATEGORY_SECTIONS = [
  { key: "story", label: "Story", scoreField: "storyScore", fields: ["plot", "premiseOriginality", "storytelling", "characterDev", "pacingClimax"] },
  { key: "style", label: "Production & Style", scoreField: "styleScore", fields: ["cinematography", "locationCost", "realism", "artisticEffect", "visualEffects", "musicSound"] },
  { key: "emotive", label: "Emotive Effect", scoreField: "emotiveScore", fields: ["overallEmotion", "relatability", "meaning", "movingness"] },
  { key: "acting", label: "Acting & Casting", scoreField: "actingScore", fields: ["casting", "actingQuality", "dialogueScripting", "blockingChoreo"] },
  { key: "entertainment", label: "Pure Entertainment", scoreField: "entertainScore", fields: ["appeal", "superficialAllure", "choreography"] },
];

interface Props {
  params: Promise<{ id: string; reviewId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, reviewId } = await params;
  const rating = await prisma.movieRating.findUnique({
    where: { id: reviewId },
    select: { ratistRating: true, user: { select: { name: true } }, movie: { select: { title: true } } },
  });
  if (!rating) return { title: "Review" };
  const title = `${rating.user.name}'s review of ${rating.movie.title}`;
  return {
    title,
    openGraph: {
      title,
      images: [{ url: `${SITE_URL}/api/og/rating?userId=${rating.user.name}&tmdbId=${id}`, width: 800, height: 500 }],
    },
  };
}

export default async function SingleReviewPage({ params }: Props) {
  const { id, reviewId } = await params;

  const rating = await prisma.movieRating.findUnique({
    where: { id: reviewId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } },
      likes: { select: { userId: true } },
    },
  });

  if (!rating) notFound();

  const ratingObj = rating as unknown as Record<string, number | null>;
  const fieldComments = (rating.fieldComments ?? {}) as Record<string, string>;
  const categoryComments = (rating.categoryComments ?? {}) as Record<string, string>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/movies/${id}/reviews`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> All reviews
      </Link>

      {/* Movie context */}
      <div className="flex items-center gap-4 mb-6">
        {rating.movie.posterPath && (
          <Link href={`/movies/${rating.movie.tmdbId}`}>
            <Image src={posterUrl(rating.movie.posterPath, "w92")} alt="" width={48} height={72} className="rounded-lg" />
          </Link>
        )}
        <div>
          <Link href={`/movies/${rating.movie.tmdbId}`} className="text-lg font-bold text-white hover:text-[var(--ratist-red)] transition-colors">
            {rating.movie.title}
          </Link>
          <p className="text-sm text-[var(--foreground-muted)]">{rating.movie.releaseDate?.slice(0, 4)}</p>
        </div>
      </div>

      {/* Review card (expanded by default on this page) */}
      <ReviewCard
        review={{
          id: rating.id,
          reviewText: rating.reviewText,
          ratistRating: rating.ratistRating,
          overallRating: rating.overallRating,
          storyScore: rating.storyScore,
          styleScore: rating.styleScore,
          emotiveScore: rating.emotiveScore,
          actingScore: rating.actingScore,
          entertainScore: rating.entertainScore,
          reviewType: rating.reviewType,
          fieldComments: rating.fieldComments as Record<string, string> | null,
          categoryComments: rating.categoryComments as Record<string, string> | null,
          hasSpoilers: rating.hasSpoilers,
          commentsDisabled: rating.commentsDisabled,
          createdAt: rating.createdAt.toISOString(),
          likeCount: rating.likes.length,
          likedByMe: false,
          user: rating.user,
        }}
        movieTmdbId={rating.movie.tmdbId}
        isFullPage
      />

      {/* Full score breakdown */}
      {rating.reviewType !== "basic" && (
        <div className="mt-6 space-y-4">
          <h2 className="text-base font-semibold text-white">Full Score Breakdown</h2>
          {CATEGORY_SECTIONS.map(({ key, label, scoreField, fields }) => {
            const catScore = ratingObj[scoreField];
            const hasFields = fields.some((f) => ratingObj[f] != null);
            if (!hasFields) return null;
            return (
              <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                  {catScore != null && (
                    <span className="text-sm font-bold" style={{ color: scoreColor(catScore) }}>{catScore.toFixed(1)}</span>
                  )}
                </div>
                {/* Category summary comment (critic mode) */}
                {categoryComments[key] && (
                  <p className="text-sm text-[var(--foreground-muted)] italic mb-3 leading-relaxed">&ldquo;{categoryComments[key]}&rdquo;</p>
                )}
                <div className="space-y-2">
                  {fields.map((fieldKey) => {
                    const val = ratingObj[fieldKey];
                    if (val == null) return null;
                    return (
                      <div key={fieldKey}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--foreground-muted)] w-32 shrink-0">{FIELD_LABELS[fieldKey] ?? fieldKey}</span>
                          <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(val / 10) * 100}%`, backgroundColor: scoreColor(val) }}
                            />
                          </div>
                          <span className="text-xs font-bold w-7 text-right" style={{ color: scoreColor(val) }}>{val.toFixed(1)}</span>
                        </div>
                        {/* Per-field comment (critic mode) */}
                        {fieldComments[fieldKey] && (
                          <p className="text-xs text-[var(--foreground-muted)]/70 ml-[140px] mt-0.5 leading-relaxed">{fieldComments[fieldKey]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
