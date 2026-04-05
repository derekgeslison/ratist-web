"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";
import { Tv } from "lucide-react";

interface FeedItem {
  id: string;
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  rating: number | null;
  createdAt: string;
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

  // Don't render anything if not logged in or no items
  if (!user || (fetched && items.length === 0)) return null;
  if (!fetched) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">From People You Follow</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/${item.type === "tv" ? "shows" : "movies"}/${item.tmdbId}`}
            className="flex-shrink-0 w-32 group"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2">
              {item.posterPath && (
                <Image
                  src={posterUrl(item.posterPath, "w185")}
                  alt={item.title}
                  fill
                  sizes="128px"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}
              {item.type === "tv" && (
                <div className="absolute top-1 left-1 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                  <Tv className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-bold leading-none">TV</span>
                </div>
              )}
              {item.rating != null && (
                <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5">
                  <span className="text-xs font-bold" style={{ color: scoreColor(item.rating) }}>
                    {item.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs font-medium text-white line-clamp-1">{item.title}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {item.user.avatarUrl ? (
                <Image src={item.user.avatarUrl} alt="" width={14} height={14} className="w-3.5 h-3.5 rounded-full object-cover" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-[6px] font-bold text-white">
                  {item.user.name[0]}
                </div>
              )}
              <span className="text-[10px] text-[var(--foreground-muted)] line-clamp-1">{item.user.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
