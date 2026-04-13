"use client";

import { useState, useEffect } from "react";
import { Music, ExternalLink, ChevronDown, ChevronUp, Disc3 } from "lucide-react";
import { getSpotifyTrackUrl } from "@/lib/affiliates";

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
}

export default function Soundtrack({ tmdbId, title, mediaType = "movie" }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albumTitle, setAlbumTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/movies/${tmdbId}/soundtrack?title=${encodeURIComponent(title)}&type=${mediaType}`)
      .then((r) => r.json())
      .then((data) => {
        setTracks(data.tracks ?? []);
        setAlbumTitle(data.albumTitle ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tmdbId, title, mediaType]);

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

  // Build Spotify search URL for a track (centralized in affiliates.ts)
  function spotifySearchUrl(track: Track) {
    return getSpotifyTrackUrl(track.title, track.artist);
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
                <a
                  href={spotifySearchUrl(track)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-green-500 hover:text-green-400 shrink-0"
                  title="Search on Spotify"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
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
