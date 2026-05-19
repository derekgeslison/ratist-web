"use client";

import { useState, useEffect } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Disc3 } from "lucide-react";
import { getAmazonSoundtrackUrl } from "@/lib/affiliates";
import AffiliateLink from "./AffiliateLink";

interface Track {
  position: number;
  title: string;
  artist: string;
  duration: string | null;
  disc?: number;
  discTitle?: string;
}

interface Props {
  tmdbId: number;
  title: string;
  mediaType?: "movie" | "tv";
  /** Full release date (ISO yyyy-mm-dd or yyyy form). Drives both the
   *  hard release-window gate (no fetch for titles without a date or
   *  more than ~1 month away) and the year-proximity scoring for
   *  same-name-different-year confusion (e.g. "Jane" vs the 2017
   *  "Jane" documentary). */
  releaseDate?: string | null;
}

export default function Soundtrack({ tmdbId, title, mediaType = "movie", releaseDate }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albumTitle, setAlbumTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Don't even call the API for titles with no known release date —
    // the server short-circuits in that case, but skipping the round
    // trip is friendlier in dev / on the prod network log.
    if (!releaseDate) { setLoading(false); return; }
    const params = new URLSearchParams({ title, type: mediaType, releaseDate });
    const yearMatch = releaseDate.match(/^(\d{4})/);
    if (yearMatch) params.set("year", yearMatch[1]);
    fetch(`/api/movies/${tmdbId}/soundtrack?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setTracks(data.tracks ?? []);
        setAlbumTitle(data.albumTitle ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tmdbId, title, mediaType, releaseDate]);

  if (loading) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">Loading soundtrack...</p>
      </div>
    );
  }

  if (tracks.length === 0) return null;

  // Group by disc if multiple discs
  const hasMultipleDiscs = tracks.some((t) => t.disc && t.disc > 1);
  const displayTracks = expanded ? tracks : tracks.slice(0, 10);
  const hasMore = tracks.length > 10;

  // Build an Amazon Music affiliate search URL for a track (centralized
  // in affiliates.ts). We have a real Amazon Associates account so this
  // path actually earns commission — Spotify did not.
  function trackSearchUrl(track: Track) {
    return getAmazonSoundtrackUrl(track.title, track.artist);
  }

  return (
    <div>
      {albumTitle && (
        <p className="text-xs text-[var(--foreground-muted)] mb-3">
          From <span className="text-white">{albumTitle}</span>
        </p>
      )}

      <div className="space-y-0.5">
        {displayTracks.map((track, i) => {
          // Show disc header if this is first track of a new disc
          const showDiscHeader = hasMultipleDiscs && (i === 0 || displayTracks[i - 1]?.disc !== track.disc);

          return (
            <div key={`${track.disc ?? 1}-${track.position}`}>
              {showDiscHeader && (
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <Disc3 className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                  <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                    {track.discTitle || `Disc ${track.disc}`}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--surface-2)] transition-colors group">
                <span className="text-xs text-[var(--foreground-muted)] w-6 text-right shrink-0">
                  {track.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{track.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)] truncate">{track.artist}</p>
                </div>
                {track.duration && (
                  <span className="text-xs text-[var(--foreground-muted)] shrink-0">{track.duration}</span>
                )}
                <AffiliateLink
                  href={trackSearchUrl(track)}
                  provider="amazon"
                  mediaType={mediaType}
                  tmdbId={tmdbId}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--foreground-muted)] hover:text-white shrink-0"
                  title="Search on Amazon Music"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </AffiliateLink>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 mt-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show all {tracks.length} tracks</>}
        </button>
      )}

      <p className="text-[10px] text-[var(--foreground-muted)] mt-3">
        Soundtrack data from <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">MusicBrainz</a>
      </p>
    </div>
  );
}
