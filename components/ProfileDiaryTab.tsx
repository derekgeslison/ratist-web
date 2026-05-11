"use client";

import { useMemo } from "react";
import Link from "next/link";
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

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DIARY_CAP = 100;

function getWatchDate(m: { watchedDate: string | null }): Date | null {
  const str = m.watchedDate;
  if (!str) return null;
  if (str.length === 10 && str[4] === "-") return new Date(`${str}T12:00:00`);
  return new Date(str);
}

export default function ProfileDiaryTab({
  seenMovies, episodeGroups = [], isOwnProfile, profileFirebaseUid,
}: Props) {
  // Merge + dedupe to a single reverse-chronological list. We show the
  // most recent DIARY_CAP entries here and link out to /seen for the
  // full archive — for users with hundreds of entries, rendering all of
  // them inline would be slow and the calendar nav we used to have was
  // less useful than a flat recency list.
  const entries = useMemo<DiaryEntry[]>(() => {
    const movieEntries: DiaryEntry[] = seenMovies.map((m) => ({
      ...m, _type: "movie" as const, id: `${m.mediaType ?? "movie"}-${m.tmdbId}`,
    }));
    const epEntries: DiaryEntry[] = episodeGroups.map((eg) => ({
      ...eg, _type: "episode" as const,
      id: `ep-${eg.showTmdbId}-${eg.watchedDate ?? "undated"}`,
      seenAt: eg.watchedDate ?? new Date().toISOString(),
      releaseDate: null,
    }));
    return [...movieEntries, ...epEntries]
      .filter((m) => m.watchedDate != null)
      .sort((a, b) => getWatchDate(b)!.getTime() - getWatchDate(a)!.getTime())
      .slice(0, DIARY_CAP);
  }, [seenMovies, episodeGroups]);

  // Group by YYYY-MM-DD for day-headers between rows. Order preserved
  // since `entries` is already sorted desc.
  const dayGroups = useMemo(() => {
    const groups: { key: string; date: Date; entries: DiaryEntry[] }[] = [];
    for (const e of entries) {
      const d = getWatchDate(e)!;
      const key = d.toISOString().slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else groups.push({ key, date: d, entries: [e] });
    }
    return groups;
  }, [entries]);

  const totalEntryCount = seenMovies.length + episodeGroups.length;
  const showingLess = totalEntryCount > entries.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {isOwnProfile ? (
          <Link href="/seen" className="text-sm text-[var(--foreground)] hover:underline">View full diary →</Link>
        ) : <div />}
        {isOwnProfile && (
          <Link href="/profile/import" className="text-xs text-[var(--foreground-muted)] hover:text-white hover:underline">
            Import from Letterboxd / IMDb →
          </Link>
        )}
      </div>

      {totalEntryCount === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--foreground-muted)] mb-3">
            {isOwnProfile ? "No movies marked as seen yet." : "No diary entries."}
          </p>
          {isOwnProfile && (
            <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Mark some movies as seen →</Link>
          )}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-center text-sm text-[var(--foreground-muted)] py-8">
          No dated diary entries yet. Mark something seen with a date to populate this list.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">
            {showingLess
              ? `Showing ${entries.length} most recent of ${totalEntryCount} total. `
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}. `}
            {isOwnProfile && showingLess && (
              <Link href="/seen" className="text-[var(--ratist-red)] hover:underline">See all in your diary →</Link>
            )}
          </p>

          <div>
            {dayGroups.map((group) => {
              const dayOfWeek = DAY_NAMES[group.date.getDay()];
              const dayNum = group.date.getDate();
              const monthShort = MONTH_NAMES_SHORT[group.date.getMonth()];
              const yearShort = group.date.getFullYear();
              return (
                <div key={group.key}>
                  <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/20">
                    <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                      {dayOfWeek}, {monthShort} {dayNum}, {yearShort}
                    </span>
                  </div>
                  {group.entries.map((m, idx) => {
                    if (m._type === "episode") {
                      return (
                        <DiaryEpisodeRow
                          key={m.id}
                          showTmdbId={m.showTmdbId}
                          title={m.title}
                          posterPath={m.posterPath}
                          year={m.year}
                          dayNumber={idx === 0 ? dayNum : null}
                          watchedDate={m.watchedDate}
                          seasonCount={m.seasonCount}
                          episodeCount={m.episodeCount}
                          seasons={m.seasons}
                          episodes={m.episodes}
                          ratistRating={m.ratistRating}
                          editable={isOwnProfile}
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
                        dayNumber={idx === 0 ? dayNum : null}
                        mediaType={m.mediaType}
                        editable={isOwnProfile}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
