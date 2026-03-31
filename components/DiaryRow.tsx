"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";

interface Props {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  ratistRating: number | null;
  voteAverage?: number | null;
  /** Day number to show on the left. null = blank (same day as row above) */
  dayNumber: number | null;
  /** Allow editing the watched date */
  editable?: boolean;
  /** Current date string for edit input */
  dateValue?: string;
  onDateChange?: (date: string) => void;
}

export default function DiaryRow({
  tmdbId, title, posterPath, year, ratistRating, voteAverage,
  dayNumber, editable, dateValue, onDateChange,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border)]/10 last:border-0">
      {/* Day number */}
      <div className="w-8 shrink-0 text-center">
        {dayNumber != null && (
          editable && onDateChange ? (
            editing ? (
              <input
                type="date"
                defaultValue={dateValue}
                autoFocus
                onBlur={(e) => { if (e.target.value) onDateChange(e.target.value); setEditing(false); }}
                className="w-full bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-xs rounded px-0.5 py-0.5 focus:outline-none [color-scheme:dark]"
              />
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-xl font-bold text-white hover:text-[var(--ratist-red)] transition-colors cursor-pointer"
                title="Edit watched date"
              >
                {dayNumber}
              </button>
            )
          ) : (
            <span className="text-xl font-bold text-white">{dayNumber}</span>
          )
        )}
      </div>

      {/* Poster */}
      <Link href={`/movies/${tmdbId}`} className="relative w-9 h-[54px] shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        {posterPath && (
          <Image src={posterUrl(posterPath, "w92")} alt={title} fill sizes="36px" className="object-cover" />
        )}
      </Link>

      {/* Title + year */}
      <div className="flex-1 min-w-0">
        <Link href={`/movies/${tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
          {title}
        </Link>
        <p className="text-xs text-[var(--foreground-muted)]">{year}</p>
      </div>

      {/* Ratings */}
      <div className="flex items-center gap-2 shrink-0">
        {voteAverage != null && voteAverage > 0 && (
          <RatingBadge type="community" score={voteAverage} size="sm" />
        )}
        {ratistRating != null ? (
          <RatingBadge type="ratist" score={ratistRating} size="sm" />
        ) : (
          <Link
            href={`/movies/${tmdbId}/rate`}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            Rate
          </Link>
        )}
      </div>
    </div>
  );
}
