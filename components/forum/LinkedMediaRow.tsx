"use client";

import Link from "next/link";
import Image from "next/image";

interface MediaItem {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
}

export default function LinkedMediaRow({ media }: { media: MediaItem[] }) {
  if (media.length === 0) return null;

  return (
    <div className="flex items-center gap-3 mb-3 overflow-x-auto">
      {media.map((m) => (
        <Link
          key={`${m.mediaType}-${m.tmdbId}`}
          href={m.mediaType === "tv" ? `/shows/${m.tmdbId}` : `/movies/${m.tmdbId}`}
          className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 hover:border-[var(--ratist-red)] transition-colors shrink-0"
        >
          {m.posterPath && (
            <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
              <Image
                src={`https://image.tmdb.org/t/p/w92${m.posterPath}`}
                alt={m.title}
                fill
                sizes="32px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate max-w-[140px]">{m.title}</p>
            <p className="text-[10px] text-[var(--foreground-muted)]">{m.mediaType === "tv" ? "TV Show" : "Movie"}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
