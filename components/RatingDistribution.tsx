"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

interface DistributionData {
  buckets: number[]; // index 0 = ratings 0-1, index 1 = 1-2, ..., index 9 = 9-10
  total: number;
  avg: number | null;
}

export default function RatingDistribution({ tmdbId, mediaType }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<DistributionData | null>(null);

  useEffect(() => {
    async function load() {
      const headers: Record<string, string> = {};
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/${mediaType === "tv" ? "shows" : "movies"}/${tmdbId}/distribution`, { headers });
      if (res.ok) setData(await res.json());
    }
    load();
  }, [tmdbId, mediaType, user]);

  if (!data || data.total === 0) return null;

  const maxCount = Math.max(...data.buckets, 1);
  const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Rating Distribution</h3>
        <span className="text-xs text-[var(--foreground-muted)]">{data.total} rating{data.total !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex items-end gap-1 h-20">
        {data.buckets.map((count, i) => {
          const pct = (count / maxCount) * 100;
          const score = i + 1;
          const color = score <= 3 ? "bg-red-500" : score <= 5 ? "bg-orange-500" : score <= 7 ? "bg-yellow-500" : "bg-green-500";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full flex flex-col items-center justify-end h-16">
                <div
                  className={`w-full rounded-t ${color} transition-all duration-300 min-h-[2px]`}
                  style={{ height: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--foreground-muted)]">{labels[i]}</span>
              {/* Tooltip */}
              {count > 0 && (
                <div className="absolute bottom-full mb-1 bg-[var(--surface)] border border-[var(--border)] text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {count} rating{count !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
