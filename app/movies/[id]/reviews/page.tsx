import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getMovieDetails } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const movie = await getMovieDetails(Number(id));
    return { title: `Reviews: ${movie.title} — The Ratist` };
  } catch {
    return { title: "Reviews — The Ratist" };
  }
}

export default async function MovieReviewsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { sort = "recent" } = await searchParams;

  let movieTitle = "Movie";
  try {
    const movie = await getMovieDetails(Number(id));
    movieTitle = movie.title;
  } catch { /* continue */ }

  const dbMovie = await prisma.movie.findUnique({
    where: { tmdbId: Number(id) },
    select: { id: true },
  });

  if (!dbMovie) notFound();

  const orderBy = sort === "top"
    ? [{ ratistRating: "desc" as const }]
    : [{ createdAt: "desc" as const }];

  const reviews = await prisma.movieRating.findMany({
    where: {
      movieId: dbMovie.id,
      reviewText: { not: null },
    },
    select: {
      id: true,
      reviewText: true,
      ratistRating: true,
      storyScore: true,
      styleScore: true,
      emotiveScore: true,
      actingScore: true,
      entertainScore: true,
      createdAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/movies/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {movieTitle}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Community Reviews</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""} for {movieTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/movies/${id}/reviews?sort=recent`}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              sort !== "top"
                ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Most Recent
          </Link>
          <Link
            href={`/movies/${id}/reviews?sort=top`}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              sort === "top"
                ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Top Rated
          </Link>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <p className="mb-2">No written reviews yet.</p>
          <Link href={`/movies/${id}/rate`} className="text-sm text-[var(--ratist-red)] hover:underline">
            Be the first to write a review →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <Link href={`/profile/${r.user.id}`} className="flex items-center gap-2 group">
                  <div className="w-8 h-8 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {r.user.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors">
                    {r.user.name}
                  </span>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  {r.ratistRating !== null && (
                    <span
                      className="text-lg font-bold"
                      style={{ color: scoreColor(r.ratistRating) }}
                    >
                      {r.ratistRating.toFixed(1)}
                    </span>
                  )}
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{r.reviewText}</p>

              {/* Pillar breakdown */}
              {(r.storyScore || r.styleScore || r.actingScore) && (
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[var(--border)]/50">
                  {[
                    { label: "Story", score: r.storyScore },
                    { label: "Style", score: r.styleScore },
                    { label: "Emotion", score: r.emotiveScore },
                    { label: "Acting", score: r.actingScore },
                    { label: "Entertainment", score: r.entertainScore },
                  ]
                    .filter((p) => p.score !== null)
                    .map((p) => (
                      <span key={p.label} className="text-xs text-[var(--foreground-muted)]">
                        {p.label}:{" "}
                        <span className="font-semibold" style={{ color: scoreColor(p.score!) }}>
                          {p.score!.toFixed(1)}
                        </span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
