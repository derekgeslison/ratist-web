"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scoreColor } from "@/lib/ratings";
import ShareButton from "./ShareButton";
import DiaryRow from "./DiaryRow";

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
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWatchDate(m: SeenMovie): Date {
  const str = m.watchedDate ?? m.seenAt;
  if (str && str.length === 10 && str[4] === "-") return new Date(`${str}T12:00:00`);
  return new Date(str);
}

export default function ProfileDiaryTab({
  seenMovies, isOwnProfile, profileUserId, activeYear, seenThisYear,
  siteUrl, watchedDates, updateWatchedDate,
}: Props) {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(parseInt(activeYear));

  const monthMovies = useMemo(() => {
    return seenMovies.filter((m) => {
      const d = getWatchDate(m);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    }).sort((a, b) => getWatchDate(b).getTime() - getWatchDate(a).getTime());
  }, [seenMovies, viewYear, viewMonth]);

  const moviesByDay = useMemo(() => {
    const map = new Map<number, SeenMovie[]>();
    for (const m of monthMovies) {
      const day = getWatchDate(m).getDate();
      const list = map.get(day) ?? [];
      list.push(m);
      map.set(day, list);
    }
    return map;
  }, [monthMovies]);

  const sortedDays = useMemo(() => [...moviesByDay.keys()].sort((a, b) => b - a), [moviesByDay]);

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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {isOwnProfile ? (
          <Link href="/seen" className="text-sm text-[var(--ratist-red)] hover:underline">View full diary →</Link>
        ) : <div />}
        <div className="flex items-center gap-3">
          {seenThisYear > 0 && (
            <>
              <Link href={`/profile/${profileUserId}/year-in-review/${activeYear}`}
                className="text-xs text-[var(--ratist-red)] hover:underline shrink-0">
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
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white">{MONTH_NAMES[viewMonth]} {viewYear}</h3>
            <button onClick={nextMonth} className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-[var(--foreground-muted)] mb-4">
            {monthMovies.length} movie{monthMovies.length !== 1 ? "s" : ""} in {MONTH_NAMES[viewMonth]}
          </p>

          {monthMovies.length === 0 ? (
            <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
          ) : (
            <div>
              {sortedDays.map((day) => {
                const dayMovies = moviesByDay.get(day) ?? [];
                const dayOfWeek = DAY_NAMES[new Date(viewYear, viewMonth, day).getDay()];
                return (
                  <div key={day}>
                    <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/20">
                      <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                        {dayOfWeek}, {MONTH_NAMES[viewMonth].slice(0, 3)} {day}
                      </span>
                    </div>
                    {dayMovies.map((m, idx) => (
                      <DiaryRow
                        key={m.tmdbId}
                        tmdbId={m.tmdbId}
                        title={m.title}
                        posterPath={m.posterPath}
                        year={m.releaseDate?.slice(0, 4) ?? ""}
                        ratistRating={m.ratistRating}
                        dayNumber={idx === 0 ? day : null}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
