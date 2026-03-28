"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";

interface SharedMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string | null;
  myRating: number;
  theirRating: number;
  diff: number;
}

interface CompareUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface CompareData {
  viewer: CompareUser;
  target: CompareUser;
  shared: SharedMovie[];
  stats: {
    totalShared: number;
    avgDiff: number | null;
    agreements: number;
    disagreements: number;
  };
}

type SortKey = "agree" | "disagree" | "title" | "myRating" | "theirRating";

export default function ComparePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("agree");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) =>
      fetch(`/api/profile/compare?targetUserId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((d) => {
      if (d.error) setError(d.error);
      else setData(d);
      setLoading(false);
    }).catch(() => { setError("Failed to load comparison."); setLoading(false); });
  }, [user, userId]);

  function sorted(movies: SharedMovie[]) {
    return [...movies].sort((a, b) => {
      if (sort === "agree") return a.diff - b.diff;
      if (sort === "disagree") return b.diff - a.diff;
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "myRating") return b.myRating - a.myRating;
      if (sort === "theirRating") return b.theirRating - a.theirRating;
      return 0;
    });
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">
        <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to compare taste profiles.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">
        Loading comparison…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">
        {error || "Something went wrong."}
      </div>
    );
  }

  const sortedMovies = sorted(data.shared);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/profile/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>

      {/* Header */}
      <div className="flex items-center justify-center gap-6 mb-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--ratist-red)] border-2 border-[var(--ratist-red)] shrink-0">
            {data.viewer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.viewer.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white">
                {data.viewer.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-white">{data.viewer.name}</p>
          <p className="text-xs text-[var(--foreground-muted)]">You</p>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold text-white">vs</p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)] shrink-0">
            {data.target.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.target.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-[var(--surface-2)]">
                {data.target.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-white">{data.target.name}</p>
          <Link href={`/profile/${userId}`} className="text-xs text-[var(--ratist-red)] hover:underline">View profile</Link>
        </div>
      </div>

      {/* Stats */}
      {data.stats.totalShared === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-white font-medium mb-1">No movies in common yet</p>
          <p className="text-sm text-[var(--foreground-muted)]">You and {data.target.name} haven&apos;t rated any of the same movies.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{data.stats.totalShared}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Movies in common</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{data.stats.avgDiff?.toFixed(1) ?? "—"}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg score difference</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{data.stats.agreements}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">In agreement (≤1 pt)</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{data.stats.disagreements}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Disagreements (≥3 pts)</p>
            </div>
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-[var(--foreground-muted)]">Sort by:</span>
            {([
              { key: "agree", label: "Most agreed" },
              { key: "disagree", label: "Most disagreed" },
              { key: "myRating", label: "My rating" },
              { key: "theirRating", label: "Their rating" },
              { key: "title", label: "Title" },
            ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${sort === key ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Movie list */}
          <div className="space-y-1">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 pb-1 text-xs text-[var(--foreground-muted)] border-b border-[var(--border)] mb-2">
              <div className="w-8 shrink-0" />
              <div className="flex-1">Movie</div>
              <div className="w-12 text-center">You</div>
              <div className="w-12 text-center">{data.target.name.split(" ")[0]}</div>
              <div className="w-10 text-center">Diff</div>
            </div>

            {sortedMovies.map((m) => (
              <Link
                key={m.tmdbId}
                href={`/movies/${m.tmdbId}`}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--surface)] transition-colors group"
              >
                <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                  {m.posterPath && (
                    <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.title}</p>
                  {m.year && <p className="text-xs text-[var(--foreground-muted)]">{m.year}</p>}
                </div>
                <span className="w-12 text-center text-sm font-bold" style={{ color: scoreColor(m.myRating) }}>
                  {m.myRating.toFixed(1)}
                </span>
                <span className="w-12 text-center text-sm font-bold" style={{ color: scoreColor(m.theirRating) }}>
                  {m.theirRating.toFixed(1)}
                </span>
                <span className={`w-10 text-center text-xs font-semibold ${m.diff <= 1 ? "text-green-400" : m.diff >= 3 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                  {m.diff === 0 ? "=" : `${m.myRating > m.theirRating ? "+" : "-"}${m.diff.toFixed(1)}`}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
