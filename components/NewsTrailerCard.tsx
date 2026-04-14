"use client";

import { useState } from "react";
import TrailerModal from "./TrailerModal";

interface Props {
  youtubeKey: string;
  title: string;
  publishedAt: string | null;
  authorName?: string;
  /** Render as compact home-page tile (true) or full news-page card (false) */
  compact?: boolean;
}

export default function NewsTrailerCard({ youtubeKey, title, publishedAt, authorName, compact }: Props) {
  const [open, setOpen] = useState(false);

  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  if (compact) {
    // Home page tile
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors group flex flex-col text-left w-full"
        >
          <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
            <img
              src={`https://img.youtube.com/vi/${youtubeKey}/mqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
              Trailer
            </div>
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>
          <div className="p-3 flex-1">
            <p className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{title}</p>
            {dateStr && (
              <p className="text-[11px] text-[var(--foreground-muted)] mt-1">{dateStr}</p>
            )}
          </div>
        </button>
        {open && <TrailerModal trailerKey={youtubeKey} onClose={() => setOpen(false)} />}
      </>
    );
  }

  // News page card — compact horizontal layout
  return (
    <>
      <article className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors">
        <button onClick={() => setOpen(true)} className="w-full text-left flex gap-4 p-4 group">
          <div className="relative w-40 sm:w-48 aspect-video rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0">
            <img
              src={`https://img.youtube.com/vi/${youtubeKey}/mqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-[var(--ratist-red)]/80 transition-colors">
                <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 uppercase flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Trailer
              </span>
              {dateStr && <span className="text-[10px] text-[var(--foreground-muted)]">{dateStr}</span>}
            </div>
            <h2 className="text-base font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{title}</h2>
          </div>
        </button>
      </article>
      {open && <TrailerModal trailerKey={youtubeKey} onClose={() => setOpen(false)} />}
    </>
  );
}
