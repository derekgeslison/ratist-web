"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "./MovieCard";
import ShowCard from "./ShowCard";
import type { TMDBMovie, TMDBShow } from "@/lib/tmdb";

interface FeedItem {
  id: string;
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string | null;
  user: { name: string; firebaseUid: string; avatarUrl: string | null };
}

export default function FollowingFeed() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    user.getIdToken().then((token) =>
      fetch("/api/feed/following", { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {})
      .finally(() => setFetched(true));
  }, [user, loading]);

  if (!user || (fetched && items.length === 0)) return null;
  if (!fetched) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">From People You Follow</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
          {items.map((item) => (
            <div key={item.id} className="w-[140px] shrink-0">
              {item.type === "tv" ? (
                <ShowCard
                  show={{
                    id: item.tmdbId,
                    name: item.title,
                    poster_path: item.posterPath,
                    vote_average: item.voteAverage ?? 0,
                    first_air_date: item.releaseDate ?? "",
                    backdrop_path: null,
                    overview: "",
                    genre_ids: [],
                  } as unknown as TMDBShow}
                />
              ) : (
                <MovieCard
                  movie={{
                    id: item.tmdbId,
                    title: item.title,
                    poster_path: item.posterPath,
                    vote_average: item.voteAverage ?? 0,
                    release_date: item.releaseDate ?? "",
                    backdrop_path: null,
                    overview: "",
                    genre_ids: [],
                  } as unknown as TMDBMovie}
                />
              )}
              <div className="flex items-center gap-1 mt-1 px-0.5">
                {item.user.avatarUrl ? (
                  <Image src={item.user.avatarUrl} alt="" width={14} height={14} className="w-3.5 h-3.5 rounded-full object-cover" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-[6px] font-bold text-white">
                    {item.user.name[0]}
                  </div>
                )}
                <span className="text-[10px] text-[var(--foreground-muted)] line-clamp-1">{item.user.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
