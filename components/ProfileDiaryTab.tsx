"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scoreColor } from "@/lib/ratings";
import ShareButton from "./ShareButton";
import DiaryRow from "./DiaryRow";
import DiaryEpisodeRow from "./DiaryEpisodeRow";

interface SeenMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  seenAt: string;
  watchedDate: string | null;
  ratistRating: number | null;
  ratingStatus: "complete" | "incomplete" | "imported" | null;
  mediaType?: "movie" | "tv";
}

interface EpisodeGroup {
  showTmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  watchedDate: string | null;
  seasonCount: number;
  episodeCount: number;
  seasons: { seasonNumber: number; episodeCount: number }[];
  episodes: { seasonNumber: number; episodeNumber: number; name: string | null }[];
  ratistRating?: number | null;
}

type DiaryEntry =
  | (SeenMovie & { _type: "movie"; id: string })
  | (EpisodeGroup & { _type: "episode"; id: string; seenAt: string; releaseDate: string | null });

interface Props {
  seenMovies: SeenMovie[];
  episodeGroups?: EpisodeGroup[];
  isOwnProfile: boolean;
  profileFirebaseUid: string;
  activeYear: string;
  seenThisYear: number;
  siteUrl: string;
  watchedDates: Record<number, string | null>;
  updateWatchedDate: (tmdbId: number, dateStr: string | null) => void;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWatchDate(m: { watchedDate: string | null }): Date | null {
  const str = m.watchedDate;
  if (!str) return null;
  if (str.length === 10 && str[4] === "-") return new Date(`${str}T12:00:00`);
  return new Date(str);
}

export default function ProfileDiaryTab({
  seenMovies, episodeGroups = [], isOwnProfile, profileFirebaseUid, activeYear, seenThisYear,
  siteUrl, watchedDates, updateWatchedDate,
}: Props) {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(parseInt(activeYear));

  // Merge movies + episode groups into unified entries
  const allEntries: DiaryEntry[] = useMemo(() => {
    const movieEntries: DiaryEntry[] = seenMovies.map((m) => ({
      ...m, _type: "movie" as const, id: `${m.mediaType ?? "movie"}-${m.tmdbId}`,
    }));
    const epEntries: DiaryEntry[] = episodeGroups.map((eg) => ({
      ...eg, _type: "episode" as const,
      id: `ep-${eg.showTmdbId}-${eg.watchedDate ?? "undated"}`,
      seenAt: eg.watchedDate ?? new Date().toISOString(),
      releaseDate: null,
    }));
    return [...movieEntries, ...epEntries];
  }, [seenMovies, episodeGroups]);

  // Only show entries with explicit watchedDate in the monthly view
  const datedEntries = useMemo(() => allEntries.filter((m) => m.watchedDate != null), [allEntries]);

  const monthEntries = useMemo(() => {
    return datedEntries.filter((m) => {
      const d = getWatchDate(m)!;
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    }).sort((a, b) => getWatchDate(b)!.getTime() - getWatchDate(a)!.getTime());
  }, [datedEntries, viewYear, viewMonth]);

  const entriesByDay = useMemo(() => {
    const map = new Map<number, DiaryEntry[]>();
    for (const m of monthEntries) {
      const day = getWatchDate(m)!.getDate();
      const list = map.get(day) ?? [];
      list.push(m);
      map.set(day, list);
    }
    return map;
  }, [monthEntries]);

  const sortedDays = useMemo(() => [...entriesByDay.keys()].sort((a, b) => b - a), [entriesByDay]);

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
          {isOwnProfile && seenThisYear > 0 && (
            <>
              <Link href={`/profile/${profileFirebaseUid}/year-in-review/${activeYear}`}
                className="text-xs text-[var(--ratist-red)] hover:underline shrink-0">
                {activeYear} Year in Review →
              </Link>
              <ShareButton
                label={`Share ${activeYear}`}
                text={`I watched ${seenThisYear} movie${seenThisYear !== 1 ? "s" : ""} in ${activeYear}! Check out my year in film on The Ratist.`}
                url={`${siteUrl}/profile/${profileFirebaseUid}/year-in-review/${activeYear}`}
                cardImageUrl={`/api/og/year-in-review?userId=${encodeURIComponent(profileFirebaseUid)}&year=${activeYear}`}
              />
            </>
          )}
        </div>
      </div>

      {seenMovies.length === 0 && episodeGroups.length === 0 ? (
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
            {monthEntries.length} entr{monthEntries.length !== 1 ? "ies" : "y"} in {MONTH_NAMES[viewMonth]}
          </p>

          {monthEntries.length === 0 ? (
            <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
          ) : (
            <div>
              {sortedDays.map((day) => {
                const dayEntries = entriesByDay.get(day) ?? [];
                const dayOfWeek = DAY_NAMES[new Date(viewYear, viewMonth, day).getDay()];
                return (
                  <div key={day}>
                    <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/20">
                      <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                        {dayOfWeek}, {MONTH_NAMES[viewMonth].slice(0, 3)} {day}
                      </span>
                    </div>
                    {dayEntries.map((m, idx) => {
                      if (m._type === "episode") {
                        return (
                          <DiaryEpisodeRow
                            key={m.id}
                            showTmdbId={m.showTmdbId}
                            title={m.title}
                            posterPath={m.posterPath}
                            year={m.year}
                            dayNumber={idx === 0 ? day : null}
                            seasonCount={m.seasonCount}
                            episodeCount={m.episodeCount}
                            seasons={m.seasons}
                            episodes={m.episodes}
                            ratistRating={m.ratistRating}
                          />
                        );
                      }
                      return (
                        <DiaryRow
                          key={m.id}
                          tmdbId={m.tmdbId}
                          title={m.title}
                          posterPath={m.posterPath}
                          year={m.releaseDate?.slice(0, 4) ?? ""}
                          ratistRating={m.ratistRating}
                          dayNumber={idx === 0 ? day : null}
                          mediaType={m.mediaType}
                        />
                      );
                    })}
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
