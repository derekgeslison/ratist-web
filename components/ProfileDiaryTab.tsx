"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";
import ShareButton from "./ShareButton";

interface SeenMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  seenAt: string;
  watchedDate: string | null;
  ratistRating: number | null;
  ratingStatus: "complete" | "incomplete" | "imported" | null;
}

interface Props {
  seenMovies: SeenMovie[];
  isOwnProfile: boolean;
  profileUserId: string;
  activeYear: string;
  seenThisYear: number;
  siteUrl: string;
  watchedDates: Record<number, string | null>;
  updateWatchedDate: (tmdbId: number, dateStr: string | null) => void;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function ProfileDiaryTab({
  seenMovies, isOwnProfile, profileUserId, activeYear, seenThisYear,
  siteUrl, watchedDates, updateWatchedDate,
}: Props) {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(parseInt(activeYear));

  // Group movies by month
  const monthMovies = useMemo(() => {
    return seenMovies.filter((m) => {
      const d = new Date(m.watchedDate ?? m.seenAt);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    }).sort((a, b) => {
      const da = new Date(a.watchedDate ?? a.seenAt).getTime();
      const db = new Date(b.watchedDate ?? b.seenAt).getTime();
      return db - da;
    });
  }, [seenMovies, viewYear, viewMonth]);

  // Group by day for display
  const moviesByDay = useMemo(() => {
    const map = new Map<string, SeenMovie[]>();
    for (const m of monthMovies) {
      const d = new Date(m.watchedDate ?? m.seenAt);
      const key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [monthMovies]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }, [viewMonth]);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link
          href="/seen"
          className="text-sm text-[var(--ratist-red)] hover:underline"
        >
          View full diary →
        </Link>
        <div className="flex items-center gap-3">
          {seenThisYear > 0 && (
            <>
              <Link
                href={`/profile/${profileUserId}/year-in-review/${activeYear}`}
                className="text-xs text-[var(--ratist-red)] hover:underline shrink-0"
              >
                {activeYear} Year in Review →
              </Link>
              <ShareButton
                label={`Share ${activeYear}`}
                text={`I watched ${seenThisYear} movie${seenThisYear !== 1 ? "s" : ""} in ${activeYear}! Check out my year in film on The Ratist.`}
                url={`${siteUrl}/profile/${profileUserId}/year-in-review/${activeYear}`}
                cardImageUrl={`/api/og/year-in-review?userId=${encodeURIComponent(profileUserId)}&year=${activeYear}`}
              />
            </>
          )}
        </div>
      </div>

      {seenMovies.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--foreground-muted)] mb-3">
            {isOwnProfile ? "No movies marked as seen yet." : "No diary entries."}
          </p>
          {isOwnProfile && (
            <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Mark some movies as seen →</Link>
          )}
        </div>
      ) : (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h3>
            <button onClick={nextMonth} className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          <p className="text-xs text-[var(--foreground-muted)] mb-4">
            {monthMovies.length} movie{monthMovies.length !== 1 ? "s" : ""} in {MONTH_NAMES[viewMonth]}
          </p>

          {monthMovies.length === 0 ? (
            <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
          ) : (
            <div className="space-y-1">
              {[...moviesByDay.entries()].map(([dayLabel, dayMovies]) => (
                <div key={dayLabel}>
                  <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider pt-3 pb-1 border-b border-[var(--border)]/20 mb-1">
                    {dayLabel}
                  </p>
                  {dayMovies.map((m) => {
                    const displayDate = watchedDates[m.tmdbId] !== undefined ? watchedDates[m.tmdbId] : m.watchedDate;
                    const dateValue = displayDate ? new Date(displayDate).toISOString().split("T")[0] : "";
                    return (
                      <div key={m.tmdbId} className="flex items-center gap-3 py-2 group">
                        <Link href={`/movies/${m.tmdbId}`} className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                          {m.posterPath && (
                            <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />
                          )}
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link href={`/movies/${m.tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                            {m.title}
                          </Link>
                          <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                        </div>
                        {/* Rating */}
                        {m.ratingStatus === "incomplete" ? (
                          <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border border-orange-400/50 text-orange-400">Incomplete</span>
                        ) : m.ratistRating != null ? (
                          <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(m.ratistRating) }}>
                            {m.ratistRating.toFixed(1)}
                          </span>
                        ) : null}
                        {/* Date (editable for own profile) */}
                        {isOwnProfile ? (
                          <input
                            type="date"
                            value={dateValue}
                            onChange={(e) => updateWatchedDate(m.tmdbId, e.target.value || null)}
                            className="text-xs text-[var(--foreground-muted)] bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--ratist-red)] focus:outline-none rounded px-1 py-0.5 cursor-pointer w-28 shrink-0 [color-scheme:dark]"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
