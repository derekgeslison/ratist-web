"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

interface DigestResponse {
  digest: string | null;
  reviewCount: number;
  generatedAt?: string | null;
}

export default function ReviewDigest({ mediaType, tmdbId }: Props) {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reviews/digest?mediaType=${mediaType}&tmdbId=${tmdbId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  if (loading || !data?.digest) return null;

  return (
    <div className="bg-gradient-to-br from-[var(--ratist-red)]/5 to-transparent border border-[var(--ratist-red)]/20 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ratist-red)]">
          AI summary of community reviews
        </span>
      </div>
      <p className="text-sm text-white leading-relaxed">{data.digest}</p>
      <p className="text-[10px] text-[var(--foreground-muted)] mt-2">
        Based on {data.reviewCount} review{data.reviewCount !== 1 ? "s" : ""} with comments · Read individual reviews below for nuance.
      </p>
    </div>
  );
}
