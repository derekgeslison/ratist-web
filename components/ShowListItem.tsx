"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, Bookmark, BookmarkCheck, Tv } from "lucide-react";
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

export default function ShowListItem({ show, characterName, streaming, rent }: Props) {
  const { user } = useAuth();
  const communityScore = show.vote_average > 0 ? show.vote_average : null;
  const { seen, watchlisted, ratistRating, markSeen: persistSeen, setWatchlistState } = useShowUserState(show.id);
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
      className="flex items-center gap-4 py-4 hover:bg-[var(--surface)] px-3 -mx-3 rounded-lg transition-colors group"
    >
      <div className="relative w-14 h-20 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        <Image src={posterUrl(show.poster_path, "w92")} alt={show.name} fill sizes="56px" className="object-cover" />
        <div className="absolute top-0.5 left-0.5 bg-blue-600/90 text-white rounded px-0.5 py-0.5 flex items-center gap-0.5 z-10">
          <Tv className="w-2 h-2" />
          <span className="text-[6px] font-bold leading-none">TV</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{show.name}</p>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
          {show.first_air_date?.slice(0, 4)}
          {characterName && <span className="text-[var(--ratist-red)]/70 ml-2">as {characterName}</span>}
        </p>
        <p className="text-xs text-[var(--foreground-muted)] mt-1 line-clamp-2 hidden sm:block">{show.overview}</p>
        {streaming && streaming.length > 0 ? (
          <div className="mt-1"><ProviderLogos providers={streaming} size={18} label="Stream" contentTitle={show.name} contentType="tv" /></div>
        ) : rent && rent.length > 0 ? (
          <div className="mt-1"><ProviderLogos providers={rent} size={18} label="Rent" contentTitle={show.name} contentType="tv" /></div>
        ) : null}
      </div>

      {user && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={markSeen}
            disabled={markingS}
            title={seen ? "Already seen" : "Mark as seen"}
            className={`flex items-center overflow-hidden transition-all duration-200 text-xs font-semibold pl-2 pr-0 group-hover:pr-2 py-1.5 rounded-full border gap-0 group-hover:gap-1.5 ${
              seen
                ? "border-green-500/50 text-green-400 bg-green-500/10 w-[26px] group-hover:w-[104px]"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-green-500/50 hover:text-green-400 w-[26px] group-hover:w-[104px]"
            }`}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap overflow-hidden w-0 group-hover:w-auto transition-all duration-200">
              {seen ? "Seen!" : markingS ? "..." : "Mark Seen"}
            </span>
          </button>

          <button
            onClick={addToWatchlist}
            disabled={markingW || watchlisted}
            title={watchlisted ? "In your watchlist" : "Add to watchlist"}
            className={`flex items-center overflow-hidden transition-all duration-200 text-xs font-semibold pl-2 pr-0 group-hover:pr-2 py-1.5 rounded-full border gap-0 group-hover:gap-1.5 ${
              watchlisted
                ? "border-blue-500/50 text-blue-400 bg-blue-500/10 w-[26px] group-hover:w-[118px] cursor-default"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-blue-400 hover:text-blue-300 w-[26px] group-hover:w-[118px]"
            }`}
          >
            {watchlisted ? <BookmarkCheck className="w-3.5 h-3.5 shrink-0" /> : <Bookmark className="w-3.5 h-3.5 shrink-0" />}
            <span className="whitespace-nowrap overflow-hidden w-0 group-hover:w-auto transition-all duration-200">
              {watchlisted ? "Watchlisted" : markingW ? "..." : "+ Watchlist"}
            </span>
          </button>
        </div>
      )}

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <RatingBadge type="community" score={communityScore} size="sm" />
        <RatingBadge type="ratist" score={ratistRating} size="sm" />
      </div>
    </Link>
  );
}
