"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, Bookmark, BookmarkCheck, Check, Tv } from "lucide-react";
import { posterUrl, type TMDBShow } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";
import ProviderLogos, { type ProviderInfo } from "./ProviderLogos";
import { useAuth } from "@/context/AuthContext";
import { useShowUserState } from "@/hooks/useShowUserState";

interface Props {
  show: TMDBShow;
  characterName?: string;
  streaming?: ProviderInfo[];
  rent?: ProviderInfo[];
}

export default function ShowCard({ show, characterName, streaming, rent }: Props) {
  const { user } = useAuth();
  const communityScore = show.vote_average > 0 ? show.vote_average : null;
  const { seen, watchlisted, markSeen: persistSeen, setWatchlistState } = useShowUserState(show.id);
  const [markingS, setMarkingS] = useState(false);
  const [markingW, setMarkingW] = useState(false);

  async function markSeen(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingS || seen) return;
    setMarkingS(true);
    const token = await user.getIdToken();
    await fetch(`/api/shows/${show.id}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: show.name, poster_path: show.poster_path, first_air_date: show.first_air_date }),
    }).catch(() => null);
    persistSeen();
    setMarkingS(false);
  }

  async function addToWatchlist(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingW || watchlisted) return;
    setMarkingW(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/shows/${show.id}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: show.name, poster_path: show.poster_path, first_air_date: show.first_air_date }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarkingW(false);
  }

  return (
    <Link
      href={`/shows/${show.id}`}
      className="group flex flex-col bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors relative"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        <Image
          src={posterUrl(show.poster_path)}
          alt={show.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* TV badge */}
        <div className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
          <Tv className="w-2.5 h-2.5" />
          <span className="text-[8px] font-bold leading-none">TV</span>
        </div>
        {user && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end gap-2 pb-3">
            <button
              onClick={markSeen}
              disabled={markingS || seen}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                seen ? "bg-green-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {seen ? <><Check className="w-3.5 h-3.5" /> Seen!</> : <><Eye className="w-3.5 h-3.5" /> {markingS ? "..." : "Mark Seen"}</>}
            </button>
            <button
              onClick={addToWatchlist}
              disabled={markingW || watchlisted}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                watchlisted ? "bg-blue-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {watchlisted ? <><BookmarkCheck className="w-3.5 h-3.5" /> Watchlisted</> : <><Bookmark className="w-3.5 h-3.5" /> {markingW ? "..." : "Watchlist"}</>}
            </button>
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1">
        <p className="text-sm font-medium text-white line-clamp-1 leading-tight">{show.name}</p>
        {characterName && <p className="text-xs text-[var(--ratist-red)]/70 line-clamp-1">as {characterName}</p>}
        <p className="text-xs text-[var(--foreground-muted)]">{show.first_air_date?.slice(0, 4) ?? "—"}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <RatingBadge type="community" score={communityScore} size="sm" />
          <RatingBadge type="ratist" score={null} size="sm" />
        </div>
        {streaming && streaming.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={streaming} size={18} label="Stream" /></div>
        ) : rent && rent.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={rent} size={18} label="Rent" /></div>
        ) : null}
      </div>
    </Link>
  );
}
