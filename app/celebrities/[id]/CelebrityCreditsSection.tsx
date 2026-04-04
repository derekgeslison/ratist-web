"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";
import PosterOverlay from "@/components/PosterOverlay";

interface Credit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  character?: string;
  job?: string;
  popularity: number;
}

const PAGE_SIZE = 20;

export default function CelebrityCreditsSection({
  credits,
  type,
}: {
  credits: Credit[];
  type: "cast" | "crew";
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = credits.slice(0, shown);
  const hasMore = shown < credits.length;

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 mb-4">
        {visible.map((movie) => (
          <Link key={`${movie.id}-${type}`} href={`/movies/${movie.id}`} className="group flex flex-col">
            <PosterOverlay tmdbId={movie.id} title={movie.title} posterPath={movie.poster_path} releaseDate={movie.release_date}>
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                {movie.poster_path ? (
                  <Image
                    src={posterUrl(movie.poster_path, "w185")}
                    alt={movie.title}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                )}
              </div>
            </PosterOverlay>
            <p className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{movie.title}</p>
            {type === "cast" && movie.character && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{movie.character}</p>}
            {type === "crew" && movie.job && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{movie.job}</p>}
            <p className="text-xs text-[var(--foreground-muted)]">{movie.release_date?.slice(0, 4)}</p>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setShown((s) => Math.min(s + PAGE_SIZE, credits.length))}
          className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
        >
          Show more ({credits.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
