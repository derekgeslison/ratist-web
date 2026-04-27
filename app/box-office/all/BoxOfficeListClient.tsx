"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, Loader2, BarChart3, Info } from "lucide-react";
import {
  formatBoxOffice,
  formatROI,
  type BoxOfficeRow,
} from "@/lib/box-office";

interface Genre {
  id: number;
  name: string;
}

interface Props {
  genres: Genre[];
}

const MPA_OPTIONS = ["G", "PG", "PG-13", "R", "NC-17", "NR"] as const;
const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "revenue-desc", label: "Highest revenue" },
  { value: "revenue-asc",  label: "Lowest revenue" },
  { value: "budget-desc",  label: "Highest budget" },
  { value: "budget-asc",   label: "Lowest budget" },
  { value: "profit-desc",  label: "Biggest profit" },
  { value: "profit-asc",   label: "Biggest loss" },
  { value: "roi-desc",     label: "Best ROI" },
  { value: "roi-asc",      label: "Worst ROI" },
  { value: "year-desc",    label: "Newest" },
  { value: "year-asc",     label: "Oldest" },
  { value: "title-asc",    label: "Title A–Z" },
];

const PAGE_SIZE = 50;

interface ListResponse {
  results: BoxOfficeRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export default function BoxOfficeListClient({ genres }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial filter state from URL so bookmarks + back-button work.
  const [sort, setSort] = useState(() => searchParams.get("sort") ?? "revenue-desc");
  const [selectedGenres, setSelectedGenres] = useState<number[]>(() => {
    const g = searchParams.get("genres");
    return g ? g.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [];
  });
  const [selectedMpa, setSelectedMpa] = useState<string[]>(() => {
    const m = searchParams.get("mpa");
    return m ? m.split(",").filter(Boolean) : [];
  });
  const [releaseFrom, setReleaseFrom] = useState(searchParams.get("releaseFrom") ?? "");
  const [releaseTo, setReleaseTo] = useState(searchParams.get("releaseTo") ?? "");

  const [results, setResults] = useState<BoxOfficeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the API URL from current filter state. Memoized so the
  // effect below only re-fires when an actual filter changes.
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    if (releaseFrom) params.set("releaseFrom", releaseFrom);
    if (releaseTo) params.set("releaseTo", releaseTo);
    params.set("limit", String(PAGE_SIZE));
    return `/api/box-office/list?${params.toString()}`;
  }, [sort, selectedGenres, selectedMpa, releaseFrom, releaseTo]);

  // Sync the same filter state to the URL bar — so back/forward and
  // direct-link sharing both work without an extra useEffect chain.
  useEffect(() => {
    const params = new URLSearchParams();
    if (sort !== "revenue-desc") params.set("sort", sort);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    if (releaseFrom) params.set("releaseFrom", releaseFrom);
    if (releaseTo) params.set("releaseTo", releaseTo);
    const qs = params.toString();
    router.replace(qs ? `/box-office/all?${qs}` : "/box-office/all", { scroll: false });
  }, [sort, selectedGenres, selectedMpa, releaseFrom, releaseTo, router]);

  // Fetch first page whenever filters change. Independent from the
  // load-more handler so we always reset to page 1 on filter change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}&page=1`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<ListResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setResults(data.results);
        setTotal(data.total);
        setPage(1);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiUrl]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`${apiUrl}&page=${nextPage}`);
      if (!res.ok) return;
      const data: ListResponse = await res.json();
      setResults((prev) => [...prev, ...data.results]);
      setPage(nextPage);
      setHasMore(data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [apiUrl, page, hasMore, loadingMore]);

  function toggleGenre(id: number) {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }
  function toggleMpa(code: string) {
    setSelectedMpa((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code],
    );
  }
  function clearAll() {
    setSelectedGenres([]);
    setSelectedMpa([]);
    setReleaseFrom("");
    setReleaseTo("");
    setSort("revenue-desc");
  }

  const filterCount =
    selectedGenres.length +
    selectedMpa.length +
    (releaseFrom ? 1 : 0) +
    (releaseTo ? 1 : 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office — All Movies</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Filter and sort every movie tracked with box-office data.
          {" "}
          <Link href="/box-office" className="text-[var(--ratist-red)] hover:underline">
            ← Back to leaderboards
          </Link>
        </p>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Profit and ROI sorts require both revenue and budget data; results are
          limited to films where TMDB has both. ROI sorts use a $100K minimum
          budget to suppress micro-budget outliers.
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Filter className="w-4 h-4" /> Filters
          </div>
          {filterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-[var(--foreground-muted)] hover:text-white inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all ({filterCount})
            </button>
          )}
          <div className="ml-auto">
            <label className="text-xs text-[var(--foreground-muted)] mr-2">Sort:</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* MPA pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] mr-1">MPA:</span>
          {MPA_OPTIONS.map((code) => {
            const active = selectedMpa.includes(code);
            return (
              <button
                key={code}
                onClick={() => toggleMpa(code)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  active
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/40"
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>

        {/* Genre chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] mr-1">Genre:</span>
          {genres.map((g) => {
            const active = selectedGenres.includes(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  active
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/40"
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        {/* Release date range */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] mr-1">Release date:</span>
          <input
            type="date"
            value={releaseFrom}
            onChange={(e) => setReleaseFrom(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
            aria-label="Release date from"
          />
          <span className="text-xs text-[var(--foreground-muted)]">to</span>
          <input
            type="date"
            value={releaseTo}
            onChange={(e) => setReleaseTo(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
            aria-label="Release date to"
          />
          {(releaseFrom || releaseTo) && (
            <button
              onClick={() => { setReleaseFrom(""); setReleaseTo(""); }}
              className="text-xs text-[var(--foreground-muted)] hover:text-white"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-[var(--foreground-muted)] mb-3">
        {loading ? "Loading…" : error ? error : `${total.toLocaleString()} movies`}
      </p>

      {/* Results list */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {/* Column header — desktop only. The columns shown adapt to
            the active sort: profit/ROI columns appear when one is the
            active sort so the most relevant value shows on the right. */}
        <div className="hidden md:grid grid-cols-[2.5rem_3rem_1fr_8rem_8rem_7rem] gap-3 px-4 py-2 border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          <span className="text-right">#</span>
          <span></span>
          <span>Title</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">Budget</span>
          <span className="text-right">
            {sort.startsWith("roi") ? "ROI" : "Profit"}
          </span>
        </div>
        {loading && results.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
            No movies match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {results.map((row, idx) => (
              <ResultRow key={row.tmdbId} row={row} rank={idx + 1} sort={sort} />
            ))}
          </ul>
        )}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Load more (${(total - results.length).toLocaleString()} remaining)`}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultRow({ row, rank, sort }: { row: BoxOfficeRow; rank: number; sort: string }) {
  const showROI = sort.startsWith("roi");
  const rightValue = showROI
    ? formatROI(row.roi)
    : row.profit != null
      ? row.profit < 0
        ? `−${formatBoxOffice(Math.abs(row.profit))}`
        : formatBoxOffice(row.profit)
      : null;

  const year = row.releaseDate?.slice(0, 4) ?? "—";

  return (
    <li>
      <Link
        href={`/movies/${row.tmdbId}`}
        className="block hover:bg-white/[0.03] transition-colors"
      >
        <div className="md:grid md:grid-cols-[2.5rem_3rem_1fr_8rem_8rem_7rem] gap-3 px-4 py-3 flex items-center">
          <span className="text-sm font-semibold text-[var(--foreground-muted)] tabular-nums w-10 md:w-auto md:text-right shrink-0">
            {rank}
          </span>
          <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--background)] mx-2 md:mx-0">
            {row.posterPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w92${row.posterPath}`}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{row.title}</p>
            <p className="text-[11px] text-[var(--foreground-muted)] md:hidden">
              {year} · {formatBoxOffice(row.revenue) ?? "—"}
              {rightValue ? ` · ${rightValue}` : ""}
            </p>
            <p className="text-[11px] text-[var(--foreground-muted)] hidden md:block">{year}</p>
          </div>
          <span className="hidden md:block text-sm text-white tabular-nums text-right">
            {formatBoxOffice(row.revenue) ?? "—"}
          </span>
          <span className="hidden md:block text-sm text-white tabular-nums text-right">
            {formatBoxOffice(row.budget) ?? "—"}
          </span>
          <span className="hidden md:block text-sm text-white tabular-nums text-right">
            {rightValue ?? "—"}
          </span>
        </div>
      </Link>
    </li>
  );
}
