"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, BookmarkCheck } from "lucide-react";
import TrailerModal from "./TrailerModal";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";
import { useShowUserState } from "@/hooks/useShowUserState";

interface Props {
  youtubeKey: string;
  title: string;
  publishedAt: string | null;
  authorName?: string;
  /** Render as compact home-page tile (true) or full news-page card (false) */
  compact?: boolean;
  /** TMDB data for poster + watchlist (news page only) */
  movieTmdbId?: number | null;
  showTmdbId?: number | null;
  posterPath?: string | null;
}

function MovieWatchlistButton({ tmdbId, posterPath }: { tmdbId: number; posterPath?: string | null }) {
  const { user } = useAuth();
  const { watchlisted, setWatchlistState } = useMovieUserState(tmdbId);
  const [marking, setMarking] = useState(false);

  if (!user) return null;

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (marking || watchlisted) return;
    setMarking(true);
    const token = await user!.getIdToken();
    const res = await fetch(`/api/movies/${tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ poster_path: posterPath }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarking(false);
  }

  return (
    <button
      onClick={add}
      disabled={marking || watchlisted}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        watchlisted ? "bg-blue-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
      }`}
    >
      {watchlisted ? <><BookmarkCheck className="w-3.5 h-3.5" /> Watchlisted</> : <><Bookmark className="w-3.5 h-3.5" /> {marking ? "..." : "Watchlist"}</>}
    </button>
  );
}

function ShowWatchlistButton({ tmdbId }: { tmdbId: number }) {
  const { user } = useAuth();
  const { watchlisted, setWatchlistState } = useShowUserState(tmdbId);
  const [marking, setMarking] = useState(false);

  if (!user) return null;

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (marking || watchlisted) return;
    setMarking(true);
    const token = await user!.getIdToken();
    const res = await fetch(`/api/shows/${tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarking(false);
  }

  return (
    <button
      onClick={add}
      disabled={marking || watchlisted}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        watchlisted ? "bg-blue-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
      }`}
    >
      {watchlisted ? <><BookmarkCheck className="w-3.5 h-3.5" /> Watchlisted</> : <><Bookmark className="w-3.5 h-3.5" /> {marking ? "..." : "Watchlist"}</>}
    </button>
  );
}

export default function NewsTrailerCard({ youtubeKey, title, publishedAt, authorName, compact, movieTmdbId, showTmdbId, posterPath }: Props) {
  const [open, setOpen] = useState(false);

  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const mediaLink = movieTmdbId ? `/movies/${movieTmdbId}` : showTmdbId ? `/shows/${showTmdbId}` : null;
  // Extract movie name from auto-generated titles like "Movie Name — Official Trailer"
  const movieName = title.includes(" — ") ? title.split(" — ")[0] : null;

  if (compact) {
    // Home page tile — unchanged
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors group flex flex-col text-left w-full"
        >
          <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
            <img
              src={`https://img.youtube.com/vi/${youtubeKey}/mqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
              Trailer
            </div>
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>
          <div className="p-3 flex-1">
            <p className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{title}</p>
            {dateStr && (
              <p className="text-[11px] text-[var(--foreground-muted)] mt-1">{dateStr}</p>
            )}
          </div>
        </button>
        {open && <TrailerModal trailerKey={youtubeKey} onClose={() => setOpen(false)} />}
      </>
    );
  }

  // News page card — poster + trailer thumbnail + watchlist
  // Mobile: stacked layout (thumbnail on top, info below)
  // Desktop: horizontal layout (poster | thumbnail | info)
  return (
    <>
      <article className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors">
        {/* Mobile layout: thumbnail left, poster+name right, video title + watchlist below */}
        <div className="sm:hidden">
          <div className="flex">
            {/* Trailer thumbnail */}
            <button onClick={() => setOpen(true)} className="relative flex-1 aspect-video bg-[var(--surface-2)] group/play">
              <img
                src={`https://img.youtube.com/vi/${youtubeKey}/mqdefault.jpg`}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover/play:bg-[var(--ratist-red)]/80 transition-colors">
                  <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
                Trailer
              </div>
            </button>
            {/* Poster + movie name */}
            {posterPath && mediaLink ? (
              <Link href={mediaLink} className="w-[30%] shrink-0 bg-[var(--surface-2)] flex flex-col items-center justify-center gap-2 p-2">
                <div className="relative w-full max-w-[80px] aspect-[2/3] rounded-lg overflow-hidden">
                  <Image src={`https://image.tmdb.org/t/p/w154${posterPath}`} alt="" fill sizes="80px" className="object-cover" />
                </div>
                {movieName && (
                  <p className="text-xs font-semibold text-white text-center line-clamp-2 leading-tight">{movieName}</p>
                )}
              </Link>
            ) : null}
          </div>
          <div className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <button onClick={() => setOpen(true)} className="text-sm font-semibold text-white line-clamp-2 text-left hover:text-[var(--ratist-red)] transition-colors">{title}</button>
              {dateStr && <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">{dateStr}</p>}
            </div>
            {movieTmdbId && (
              <MovieWatchlistButton tmdbId={movieTmdbId} posterPath={posterPath} />
            )}
            {showTmdbId && !movieTmdbId && (
              <ShowWatchlistButton tmdbId={showTmdbId} />
            )}
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:flex gap-4 p-4">
          {/* Movie/show poster */}
          {posterPath && mediaLink && (
            <Link href={mediaLink} className="relative w-20 aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0 group/poster">
              <Image
                src={`https://image.tmdb.org/t/p/w154${posterPath}`}
                alt=""
                fill
                sizes="80px"
                className="object-cover group-hover/poster:scale-105 transition-transform duration-300"
              />
            </Link>
          )}

          {/* Trailer thumbnail + play button */}
          <button onClick={() => setOpen(true)} className="relative w-48 aspect-video rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0 group/play">
            <img
              src={`https://img.youtube.com/vi/${youtubeKey}/mqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover/play:bg-[var(--ratist-red)]/80 transition-colors">
                <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </button>

          {/* Info + actions */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 uppercase flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Trailer
              </span>
              {dateStr && <span className="text-[10px] text-[var(--foreground-muted)]">{dateStr}</span>}
            </div>
            {mediaLink && movieName && (
              <Link href={mediaLink} className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors mb-0.5">{movieName}</Link>
            )}
            <button onClick={() => setOpen(true)} className="text-base font-semibold text-white line-clamp-2 text-left hover:text-[var(--ratist-red)] transition-colors">{title}</button>
            <div className="mt-auto pt-2">
              {movieTmdbId && (
                <MovieWatchlistButton tmdbId={movieTmdbId} posterPath={posterPath} />
              )}
              {showTmdbId && !movieTmdbId && (
                <ShowWatchlistButton tmdbId={showTmdbId} />
              )}
            </div>
          </div>
        </div>
      </article>
      {open && <TrailerModal trailerKey={youtubeKey} onClose={() => setOpen(false)} />}
    </>
  );
}
