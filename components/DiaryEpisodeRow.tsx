"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Calendar, Check, X } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";
import { useAuth } from "@/context/AuthContext";

interface Props {
  showTmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  dayNumber: number | null;
  watchedDate: string | null;
  seasonCount: number;
  episodeCount: number;
  seasons: { seasonNumber: number; episodeCount: number }[];
  episodes: { seasonNumber: number; episodeNumber: number; name: string | null }[];
  ratistRating?: number | null;
  editable?: boolean;
  onDateChange?: (newDate: string | null) => void;
  onEpisodeDateChange?: () => void;
}

export default function DiaryEpisodeRow({
  showTmdbId, title, posterPath, year, dayNumber, watchedDate,
  seasonCount, episodeCount, seasons, episodes, ratistRating,
  editable = true, onDateChange, onEpisodeDateChange,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [pendingDate, setPendingDate] = useState("");
  const detailPath = `/shows/${showTmdbId}`;
  const isSingle = episodeCount === 1;
  const canExpand = !isSingle;

  // Format date value for input (strip time portion)
  const dateValue = watchedDate?.slice(0, 10) ?? null;

  // Build subtitle
  let subtitle: string;
  if (isSingle && episodes.length === 1) {
    const ep = episodes[0];
    subtitle = `S${ep.seasonNumber}E${ep.episodeNumber}${ep.name ? ` — ${ep.name}` : ""}`;
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

  async function saveGroupDate(date: string | null) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ watchedDate: date }),
    }).catch(() => {});
    onDateChange?.(date);
    onEpisodeDateChange?.();
  }

  async function saveEpisodeDate(seasonNumber: number, episodeNumber: number, date: string | null) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        episodes: [{ seasonNumber, episodeNumber }],
        watchedDate: date,
      }),
    }).catch(() => {});
    // Trigger refetch so grouping updates
    onEpisodeDateChange?.();
  }

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

        {/* Date edit + Rating */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {editable && user && onDateChange && (
            editingDate ? (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={pendingDate}
                  autoFocus
                  onChange={(e) => setPendingDate(e.target.value)}
                  className="w-28 bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-xs rounded px-1 py-0.5 focus:outline-none [color-scheme:dark]"
                />
                <button
                  onClick={() => {
                    if (pendingDate && pendingDate !== (dateValue ?? "")) {
                      saveGroupDate(pendingDate);
                    }
                    setEditingDate(false);
                  }}
                  className="text-green-400 hover:text-green-300 transition-colors"
                  title={`Save date for all ${episodeCount} episodes`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                {(dateValue || pendingDate) && (
                  <button
                    onClick={() => { saveGroupDate(null); setPendingDate(""); setEditingDate(false); }}
                    className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                    title="Remove date"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setPendingDate(dateValue ?? ""); setEditingDate(true); }}
                className="p-1 text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
                title={episodeCount > 1 ? `Edit date for all ${episodeCount} episodes` : "Edit watched date"}
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            )
          )}
          {ratistRating != null ? (
            <RatingBadge type="ratist" score={ratistRating} size="sm" />
          ) : (
            <Link
              href={`${detailPath}/rate`}
              className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
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

      {/* Expanded episode list with per-episode date editing */}
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
                <EpisodeRow
                  key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                  seasonNumber={ep.seasonNumber}
                  episodeNumber={ep.episodeNumber}
                  name={ep.name}
                  groupDate={dateValue}
                  editable={editable && !!user}
                  onDateChange={(date) => saveEpisodeDate(ep.seasonNumber, ep.episodeNumber, date)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EpisodeRow({
  seasonNumber, episodeNumber, name, groupDate, editable, onDateChange,
}: {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  groupDate: string | null;
  editable: boolean;
  onDateChange: (date: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pendingDate, setPendingDate] = useState("");

  return (
    <div className="flex items-center gap-2 py-0.5">
      <p className="text-xs text-[var(--foreground-muted)] flex-1">
        <span className="text-white/60">S{seasonNumber}E{episodeNumber}</span>
        {name && <span> — {name}</span>}
      </p>
      {editable && (
        editing ? (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={pendingDate}
              autoFocus
              onChange={(e) => setPendingDate(e.target.value)}
              className="w-28 bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-xs rounded px-1 py-0.5 focus:outline-none [color-scheme:dark]"
            />
            <button
              onClick={() => { if (pendingDate) onDateChange(pendingDate); setEditing(false); }}
              className="text-green-400 hover:text-green-300 transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setEditing(false); setPendingDate(""); }}
              className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setPendingDate(groupDate ?? ""); setEditing(true); }}
            className="p-0.5 text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
            title="Set date for this episode"
          >
            <Calendar className="w-3 h-3" />
          </button>
        )
      )}
    </div>
  );
}
