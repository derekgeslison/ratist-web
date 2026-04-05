"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";

interface Props {
  showTmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  dayNumber: number | null;
  seasonCount: number;
  episodeCount: number;
  seasons: { seasonNumber: number; episodeCount: number }[];
  episodes: { seasonNumber: number; episodeNumber: number; name: string | null }[];
  ratistRating?: number | null;
}

export default function DiaryEpisodeRow({
  showTmdbId, title, posterPath, year, dayNumber,
  seasonCount, episodeCount, seasons, episodes, ratistRating,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const detailPath = `/shows/${showTmdbId}`;
  const isSingle = episodeCount === 1;
  const canExpand = !isSingle;

  // Build subtitle
  let subtitle: string;
  if (isSingle && episodes.length === 1) {
    const ep = episodes[0];
    subtitle = `S${ep.seasonNumber} E${ep.episodeNumber}${ep.name ? `: ${ep.name}` : ""}`;
  } else if (seasonCount === 1 && seasons.length === 1) {
    subtitle = `Season ${seasons[0].seasonNumber}, ${episodeCount} episode${episodeCount !== 1 ? "s" : ""}`;
  } else {
    subtitle = `${seasonCount} season${seasonCount !== 1 ? "s" : ""}, ${episodeCount} episode${episodeCount !== 1 ? "s" : ""}`;
  }

  // Group episodes by season for expanded view
  const episodesBySeason = seasons.map((s) => ({
    seasonNumber: s.seasonNumber,
    episodes: episodes
      .filter((ep) => ep.seasonNumber === s.seasonNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber),
  }));

  return (
    <div>
      <div
        className={`flex items-center gap-3 py-2.5 border-b border-[var(--border)]/10 last:border-0 ${canExpand ? "cursor-pointer" : ""}`}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
      >
        {/* Day number */}
        <div className="w-8 shrink-0 text-center">
          {dayNumber != null && (
            <span className="text-xl font-bold text-white">{dayNumber}</span>
          )}
        </div>

        {/* Poster */}
        <Link
          href={detailPath}
          className="relative w-9 h-[54px] shrink-0 rounded overflow-hidden bg-[var(--surface-2)]"
          onClick={(e) => e.stopPropagation()}
        >
          {posterPath && (
            <Image src={posterUrl(posterPath, "w92")} alt={title} fill sizes="36px" className="object-cover" />
          )}
        </Link>

        {/* Title + subtitle + TV badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={detailPath}
              className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1"
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </Link>
            <span className="shrink-0 px-1 py-0.5 text-[9px] font-bold uppercase rounded bg-blue-600/20 text-blue-400 leading-none">TV</span>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">{subtitle}</p>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2 shrink-0">
          {ratistRating != null ? (
            <RatingBadge type="ratist" score={ratistRating} size="sm" />
          ) : (
            <Link
              href={`${detailPath}/rate`}
              className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Rate
            </Link>
          )}
        </div>

        {/* Expand chevron */}
        {canExpand && (
          <div className="shrink-0 text-[var(--foreground-muted)]">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </div>

      {/* Expanded episode list */}
      {expanded && canExpand && (
        <div className="ml-11 pl-3 border-l-2 border-[var(--border)]/20 pb-2">
          {episodesBySeason.map((season) => (
            <div key={season.seasonNumber}>
              {seasonCount > 1 && (
                <p className="text-[10px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mt-2 mb-1">
                  Season {season.seasonNumber}
                </p>
              )}
              {season.episodes.map((ep) => (
                <p key={`${ep.seasonNumber}-${ep.episodeNumber}`} className="text-xs text-[var(--foreground-muted)] py-0.5">
                  S{ep.seasonNumber}E{ep.episodeNumber}{ep.name ? `: ${ep.name}` : ""}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
