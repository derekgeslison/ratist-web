"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Tv, Film as FilmIcon } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import PosterOverlay from "@/components/PosterOverlay";

export interface Credit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  character?: string;
  job?: string;
  popularity: number;
  mediaType?: "movie" | "tv";
}

const PAGE_SIZE = 20;

export default function CelebrityCreditsSection({
  credits,
  type,
  personId,
}: {
  credits: Credit[];
  type: "cast" | "crew";
  personId?: number;
}) {
  const storageKey = personId ? `celeb-credits-${personId}-${type}` : null;

  const [shown, setShown] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return PAGE_SIZE;
    try { return Number(sessionStorage.getItem(`${storageKey}-shown`)) || PAGE_SIZE; } catch { return PAGE_SIZE; }
  });
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">(() => {
    if (typeof window === "undefined" || !storageKey) return "all";
    try { return (sessionStorage.getItem(`${storageKey}-filter`) as "all" | "movie" | "tv") || "all"; } catch { return "all"; }
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`${storageKey}-shown`, String(shown));
      sessionStorage.setItem(`${storageKey}-filter`, mediaFilter);
    } catch { /* ignore */ }
  }, [shown, mediaFilter, storageKey]);

  const hasMovies = credits.some((c) => c.mediaType !== "tv");
  const hasShows = credits.some((c) => c.mediaType === "tv");
  const showToggle = hasMovies && hasShows;

  const filtered = mediaFilter === "all" ? credits : credits.filter((c) => (c.mediaType ?? "movie") === mediaFilter);
  const visible = filtered.slice(0, shown);
  const hasMore = shown < filtered.length;

  return (
    <div>
      {showToggle && (
        <div className="flex items-center gap-1 mb-4">
          {([
            { value: "all" as const, label: "All" },
            { value: "movie" as const, label: "Movies", icon: FilmIcon },
            { value: "tv" as const, label: "TV", icon: Tv },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setMediaFilter(value); setShown(PAGE_SIZE); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                mediaFilter === value
                  ? value === "tv" ? "bg-blue-600/20 border border-blue-500/40 text-blue-400" : "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white"
                  : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 mb-4">
        {visible.map((item, idx) => {
          const isTV = item.mediaType === "tv";
          const href = isTV ? `/shows/${item.id}` : `/movies/${item.id}`;
          return (
            <Link key={`${item.id}-${type}-${item.mediaType ?? "m"}-${idx}`} href={href} className="group flex flex-col">
              <PosterOverlay tmdbId={item.id} title={item.title} posterPath={item.poster_path} releaseDate={item.release_date} voteAverage={item.vote_average} mediaType={isTV ? "tv" : "movie"} showRatings>
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                  {item.poster_path ? (
                    <Image
                      src={posterUrl(item.poster_path, "w185")}
                      alt={item.title}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                  )}
                  {isTV && (
                    <div className="absolute top-1 left-1 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                      <Tv className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-bold leading-none">TV</span>
                    </div>
                  )}
                </div>
              </PosterOverlay>
              <p className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{item.title}</p>
              {type === "cast" && item.character && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{item.character}</p>}
              {type === "crew" && item.job && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1">{item.job}</p>}
              <p className="text-xs text-[var(--foreground-muted)]">{item.release_date?.slice(0, 4)}</p>
            </Link>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShown((s) => Math.min(s + PAGE_SIZE, filtered.length))}
          className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
        >
          Show more ({filtered.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
