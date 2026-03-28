"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Star, ArrowRight } from "lucide-react";
import { posterUrl, type TMDBMovie, type TMDBCastMember, type TMDBCrewMember, type TMDBImage, type TMDBWatchProvider } from "@/lib/tmdb";
import TrailerModal from "./TrailerModal";
import WatchProviders from "./WatchProviders";
import { scoreColor } from "@/lib/ratings";

interface Review {
  id: string;
  reviewText: string;
  ratistRating: number | null;
  user: { name: string; avatarUrl: string | null };
  createdAt: string;
}

interface Props {
  movie: TMDBMovie;
  trailerKey: string | null;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
  images: TMDBImage[];
  recommendations: TMDBMovie[];
  streaming: TMDBWatchProvider[] | null;
  rent: TMDBWatchProvider[] | null;
  reviews: Review[];
}

const TABS = ["Overview", "Cast & Crew", "Media"] as const;
type Tab = (typeof TABS)[number];

function FactRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-[var(--foreground-muted)] shrink-0 w-28">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

export default function MovieDetailTabs({
  movie,
  trailerKey,
  cast,
  crew,
  images,
  recommendations,
  streaming,
  rent,
  reviews,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [showAllCast, setShowAllCast] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);

  // Extract key crew roles
  const directors = crew.filter((c) => c.job === "Director");
  const writers = crew.filter((c) => c.job === "Screenplay" || c.job === "Writer" || c.job === "Story");
  const composers = crew.filter((c) => c.job === "Original Music Composer");

  const displayedCast = showAllCast ? cast : cast.slice(0, 18);

  return (
    <>
      {trailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setTrailerOpen(false)} />
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-8">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[var(--ratist-red)] text-white"
                : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "Overview" && (
        <div className="space-y-10 pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: overview + trailer + reviews */}
            <div className="lg:col-span-2 space-y-6">
              <p className="text-[var(--foreground-muted)] leading-relaxed">{movie.overview}</p>

              <div className="flex flex-wrap items-center gap-3">
                {trailerKey && (
                  <button
                    onClick={() => setTrailerOpen(true)}
                    className="inline-flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
                  >
                    <Play className="w-4 h-4 fill-white" /> Watch Trailer
                  </button>
                )}
                <Link
                  href={`/movies/${movie.id}/rate`}
                  className="inline-flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
                >
                  Rate &amp; Review
                </Link>
              </div>

              {/* Text reviews */}
              {reviews.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white">
                      Community Reviews
                      <span className="ml-2 text-sm font-normal text-[var(--foreground-muted)]">({reviews.length})</span>
                    </h3>
                    {reviews.length > 5 && (
                      <Link
                        href={`/movies/${movie.id}/reviews`}
                        className="text-sm text-[var(--ratist-red)] hover:underline flex items-center gap-1"
                      >
                        See all {reviews.length} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                  <div className="space-y-4">
                    {reviews.slice(0, 5).map((r) => (
                      <div key={r.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {r.user.name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="text-sm font-medium text-white">{r.user.name}</span>
                          {r.ratistRating !== null && (
                            <span
                              className="ml-auto text-sm font-bold"
                              style={{ color: scoreColor(r.ratistRating) }}
                            >
                              {r.ratistRating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed line-clamp-4">
                          {r.reviewText}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]/60 mt-2">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: facts + watch providers */}
            <div className="space-y-6">
              <div className="space-y-3">
                <FactRow label="Status" value={movie.status} />
                <FactRow label="Release Date" value={movie.release_date} />
                {directors.length > 0 && (
                  <FactRow label="Director" value={directors.map((d) => d.name).join(", ")} />
                )}
                {writers.length > 0 && (
                  <FactRow label="Screenplay" value={writers.slice(0, 3).map((w) => w.name).join(", ")} />
                )}
                {composers.length > 0 && (
                  <FactRow label="Music" value={composers[0].name} />
                )}
                {movie.budget ? (
                  <FactRow label="Budget" value={`$${movie.budget.toLocaleString()}`} />
                ) : null}
                {movie.revenue ? (
                  <FactRow label="Revenue" value={`$${movie.revenue.toLocaleString()}`} />
                ) : null}
              </div>

              <WatchProviders
                streaming={streaming ?? undefined}
                rent={rent ?? undefined}
              />
            </div>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">More Like This</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {recommendations.slice(0, 12).map((m) => (
                  <Link key={m.id} href={`/movies/${m.id}`} className="group flex flex-col">
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                      <Image
                        src={posterUrl(m.poster_path, "w185")}
                        alt={m.title}
                        fill
                        sizes="(max-width: 640px) 33vw, 15vw"
                        className="object-cover"
                      />
                    </div>
                    <p className="text-xs font-medium text-white line-clamp-1">{m.title}</p>
                    {m.vote_average > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {m.vote_average.toFixed(1)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── CAST & CREW TAB ── */}
      {activeTab === "Cast & Crew" && (
        <div className="space-y-10 pb-16">
          {/* Directors / key crew */}
          {(directors.length > 0 || writers.length > 0) && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Filmmakers</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[...directors, ...writers.slice(0, 4)].map((member, i) => (
                  <Link key={`${member.id}-${i}`} href={`/celebrities/${member.id}`} className="group flex flex-col items-center text-center gap-1.5">
                    <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                      {member.profile_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                          alt={member.name}
                          fill
                          sizes="100px"
                          className="object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-2xl">👤</div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{member.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{member.job}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Full cast */}
          {cast.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Cast</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {displayedCast.map((member) => (
                  <Link key={member.id} href={`/celebrities/${member.id}`} className="group flex flex-col items-center text-center gap-1.5">
                    <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                      {member.profile_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                          alt={member.name}
                          fill
                          sizes="(max-width: 640px) 33vw, 12vw"
                          className="object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-2xl">👤</div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{member.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{member.character}</p>
                  </Link>
                ))}
              </div>
              {cast.length > 18 && !showAllCast && (
                <button
                  onClick={() => setShowAllCast(true)}
                  className="mt-4 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  Show all {cast.length} cast members
                </button>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── MEDIA TAB ── */}
      {activeTab === "Media" && (
        <div className="space-y-8 pb-16">
          {trailerKey && (
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Trailer</h2>
              <button
                onClick={() => setTrailerOpen(true)}
                className="relative aspect-video w-full max-w-2xl rounded-xl overflow-hidden group cursor-pointer"
              >
                <Image
                  src={`https://img.youtube.com/vi/${trailerKey}/maxresdefault.jpg`}
                  alt="Trailer thumbnail"
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[var(--ratist-red)] flex items-center justify-center">
                    <Play className="w-7 h-7 fill-white text-white ml-1" />
                  </div>
                </div>
              </button>
            </section>
          )}

          {images.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-base font-semibold text-white">Images &amp; Stills</h2>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {showAllImages ? images.length : Math.min(12, images.length)} of {images.length}
                </span>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">Click any image to view full size</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(showAllImages ? images : images.slice(0, 12)).map((img, i) => (
                  <a
                    key={i}
                    href={`https://image.tmdb.org/t/p/original${img.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors block"
                  >
                    <Image
                      src={`https://image.tmdb.org/t/p/w780${img.file_path}`}
                      alt={`Still ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </a>
                ))}
              </div>
              {images.length > 12 && (
                <button
                  onClick={() => setShowAllImages((v) => !v)}
                  className="mt-4 text-sm text-[var(--ratist-red)] hover:underline"
                >
                  {showAllImages ? "Show fewer" : `Show all ${images.length} images`}
                </button>
              )}
            </section>
          )}

          {images.length === 0 && !trailerKey && (
            <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">No media available for this title.</p>
          )}
        </div>
      )}
    </>
  );
}
