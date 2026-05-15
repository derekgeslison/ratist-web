import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/score-color";
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
  casting: "Casting & Subjects", actingQuality: "Performance Quality",
  dialogueScripting: "Dialogue & Writing", blockingChoreo: "Choreography",
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
    alternates: { canonical: `/movies/${id}/reviews/${reviewId}` },
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
      user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
      movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } },
    },
  });

  if (!rating) notFound();

  // Top director(s) for the reviewed movie, for the Movie schema nested
  // inside the Review. Optional field but satisfies Google's rich-result
  // requirements fully.
  const directors = await prisma.movieCast.findMany({
    where: { movieId: rating.movie.id, creditType: "crew", job: "Director" },
    select: { celebrity: { select: { name: true } } },
    take: 3,
  }).catch(() => []);

  const ratingObj = rating as unknown as Record<string, number | null>;
  const fieldComments = (rating.fieldComments ?? {}) as Record<string, string>;
  const categoryComments = (rating.categoryComments ?? {}) as Record<string, string>;

  // Review schema — eligible for Google star-rating rich snippet under the
  // review's search result. Only emit when we actually have a score (otherwise
  // Google rejects the schema).
  const reviewSchema = rating.ratistRating != null ? {
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "Movie",
      name: rating.movie.title,
      url: `https://www.theratist.com/movies/${rating.movie.tmdbId}`,
      ...(rating.movie.posterPath ? { image: posterUrl(rating.movie.posterPath, "w500") } : {}),
      ...(rating.movie.releaseDate ? { datePublished: rating.movie.releaseDate } : {}),
      ...(directors.length > 0
        ? { director: directors.map((d) => ({ "@type": "Person", name: d.celebrity.name })) }
        : {}),
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: rating.ratistRating.toFixed(1),
      bestRating: "10",
      worstRating: "1",
    },
    author: {
      "@type": "Person",
      name: rating.user.name,
      ...(rating.user.firebaseUid ? { url: `https://www.theratist.com/profile/${rating.user.firebaseUid}` } : {}),
    },
    datePublished: rating.createdAt.toISOString(),
    ...(rating.reviewText ? { reviewBody: rating.reviewText.slice(0, 1000) } : {}),
    url: `https://www.theratist.com/movies/${id}/reviews/${reviewId}`,
  } : null;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
      { "@type": "ListItem", position: 2, name: "Movies", item: "https://www.theratist.com/movies" },
      { "@type": "ListItem", position: 3, name: rating.movie.title, item: `https://www.theratist.com/movies/${rating.movie.tmdbId}` },
      { "@type": "ListItem", position: 4, name: "Reviews", item: `https://www.theratist.com/movies/${rating.movie.tmdbId}/reviews` },
      { "@type": "ListItem", position: 5, name: `${rating.user.name}'s review`, item: `https://www.theratist.com/movies/${id}/reviews/${reviewId}` },
    ],
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {reviewSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <h1 className="sr-only">{rating.user.name}&apos;s review of {rating.movie.title}</h1>
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
          commentCount: 0, // loaded client-side by CommentSection
          likeCount: 0, // loaded client-side by PostLikeButton
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
