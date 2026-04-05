"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Calendar } from "lucide-react";
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
  onDateChange?: (showTmdbId: number, newDate: string | null) => void;
}

export default function DiaryEpisodeRow({
  showTmdbId, title, posterPath, year, dayNumber, watchedDate,
  seasonCount, episodeCount, seasons, episodes, ratistRating, onDateChange,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [saving, setSaving] = useState(false);
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

        {/* Date edit + Rating */}
        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingDate(!editingDate); }}
              className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors"
              title="Change date"
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
          )}
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

      {/* Date editor */}
      {editingDate && user && (
        <div className="ml-11 pl-3 py-2 flex items-center gap-3 border-b border-[var(--border)]/10">
          <span className="text-xs text-[var(--foreground-muted)]">Watched date for all {episodeCount} episode{episodeCount !== 1 ? "s" : ""}:</span>
          <input
            type="date"
            defaultValue={watchedDate ?? ""}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white [color-scheme:dark] focus:outline-none focus:border-[var(--ratist-red)]"
            onChange={async (e) => {
              const val = e.target.value || null;
              setSaving(true);
              const token = await user.getIdToken();
              await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ watchedDate: val }),
              }).catch(() => {});
              onDateChange?.(showTmdbId, val);
              setSaving(false);
            }}
            disabled={saving}
          />
          {watchedDate && (
            <button
              onClick={async () => {
                setSaving(true);
                const token = await user.getIdToken();
                await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ watchedDate: null }),
                }).catch(() => {});
                onDateChange?.(showTmdbId, null);
                setSaving(false);
              }}
              disabled={saving}
              className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
            >
              Clear date
            </button>
          )}
          {saving && <span className="text-xs text-[var(--foreground-muted)]">Saving...</span>}
        </div>
      )}

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
