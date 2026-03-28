"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { backdropUrl, type TMDBMovie } from "@/lib/tmdb";

interface Props {
  movies: TMDBMovie[];
}

export default function HeroBanner({ movies }: Props) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setCurrent((i) => (i + 1) % movies.length), [movies.length]);
  const prev = useCallback(() => setCurrent((i) => (i - 1 + movies.length) % movies.length), [movies.length]);

  useEffect(() => {
    if (paused || movies.length <= 1) return;
    const t = setInterval(next, 7000);
    return () => clearInterval(t);
  }, [paused, next, movies.length]);

  const movie = movies[current];
  if (!movie) return null;

  return (
    <div
      className="relative w-full h-[60vh] min-h-[400px] max-h-[680px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Backdrop images — stack all, crossfade current */}
      {movies.map((m, i) => (
        <div
          key={m.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0"}`}
        >
          <Image
            src={backdropUrl(m.backdrop_path)}
            alt={m.title}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover object-top"
          />
        </div>
      ))}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/80 z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent z-10" />

      {/* Movie info */}
      <div className="absolute inset-0 flex items-end pb-14 sm:items-center sm:pb-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-widest text-[var(--ratist-red)] font-semibold mb-2">
              Featured
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-3">
              {movie.title}
            </h2>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 font-semibold text-sm px-3 py-1 rounded-full">
                <Star className="w-3.5 h-3.5 fill-yellow-400" />
                {movie.vote_average.toFixed(1)}
              </span>
              {movie.release_date && (
                <span className="text-sm text-[var(--foreground-muted)]">
                  {movie.release_date.slice(0, 4)}
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base text-[var(--foreground-muted)] line-clamp-2 max-w-lg mb-6">
              {movie.overview}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href={`/movies/${movie.id}`}
                className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
              >
                Rate It
              </Link>
              <Link
                href={`/movies/${movie.id}`}
                className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors border border-[var(--border)] hover:border-white px-5 py-2.5 rounded-full"
              >
                Explore Movie
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Prev / Next arrows */}
      {movies.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 right-6 z-30 flex items-center gap-2">
            {movies.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === current ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
