"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, Loader2, TrendingUp, Info, ChevronDown, ChevronUp } from "lucide-react";
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

// ISO 639-1 codes for the language filter. Curated to the languages
// most likely to surface real box-office data — TMDB stores 100+ but
// almost all the films users browse fall into this set. "Other" isn't
// represented; users searching for niche languages can still use the
// URL param directly. Order is rough usage frequency rather than
// alphabetical so common picks (English, Spanish, etc.) lead.
const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "id", label: "Indonesian" },
  { code: "he", label: "Hebrew" },
  { code: "da", label: "Danish" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
];

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
  // Single language filter (dropdown). The API still accepts a
  // comma-separated list but the UI now exposes one at a time —
  // multi-select dropdowns are clunky and "all-of-X" composition is
  // rarely useful for box office.
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const l = searchParams.get("languages") ?? "";
    // Backwards-compat: a multi-value URL preserves the first entry only.
    return l.split(",").filter(Boolean)[0] ?? "";
  });
  // Release date filter has two modes — "year" (default; pick whole
  // years on each side) and "date" (pick specific YYYY-MM-DD dates).
  // The underlying state is always YYYY-MM-DD; the UI swaps the
  // inputs based on `dateMode` and translates year inputs by
  // anchoring at Jan 1 / Dec 31 of the chosen year.
  const [releaseFrom, setReleaseFrom] = useState(searchParams.get("releaseFrom") ?? "");
  const [releaseTo, setReleaseTo] = useState(searchParams.get("releaseTo") ?? "");
  const [dateMode, setDateMode] = useState<"year" | "date">(() => {
    const m = searchParams.get("dateMode");
    return m === "date" ? "date" : "year";
  });
  // Collapsed by default — most users land via a "View all →" link
  // from a leaderboard tile and just want to scroll the list. The
  // filters are a power-user surface; keep them out of the way until
  // the user opts in. The active-filter count stays visible in the
  // collapsed header so it's clear when filters are already applied.
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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
    if (selectedLanguage) params.set("languages", selectedLanguage);
    if (releaseFrom) params.set("releaseFrom", releaseFrom);
    if (releaseTo) params.set("releaseTo", releaseTo);
    params.set("limit", String(PAGE_SIZE));
    return `/api/box-office/list?${params.toString()}`;
  }, [sort, selectedGenres, selectedMpa, selectedLanguage, releaseFrom, releaseTo]);

  // Sync the same filter state to the URL bar — so back/forward and
  // direct-link sharing both work without an extra useEffect chain.
  useEffect(() => {
    const params = new URLSearchParams();
    if (sort !== "revenue-desc") params.set("sort", sort);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    if (selectedLanguage) params.set("languages", selectedLanguage);
    if (releaseFrom) params.set("releaseFrom", releaseFrom);
    if (releaseTo) params.set("releaseTo", releaseTo);
    if (dateMode !== "year") params.set("dateMode", dateMode);
    const qs = params.toString();
    router.replace(qs ? `/box-office/all?${qs}` : "/box-office/all", { scroll: false });
  }, [sort, selectedGenres, selectedMpa, selectedLanguage, releaseFrom, releaseTo, dateMode, router]);

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
    setSelectedLanguage("");
    setReleaseFrom("");
    setReleaseTo("");
    setSort("revenue-desc");
    // Date mode is a UI preference, not a filter — leaving it alone
    // so toggling clear-all doesn't reset the user's display choice.
  }

  // Year-mode inputs hold their own draft state so partial typing
  // doesn't get clobbered. The previous version derived the input
  // value off releaseFrom and only synced when the regex matched
  // exactly 4 digits — typing "2" set the canonical state to ""
  // and yearFrom recomputed back to "" on every keystroke, making
  // the field appear inert. Now we hold a draft locally and only
  // promote to the canonical YYYY-MM-DD state when the draft is a
  // valid 4-digit year (or empty).
  const [yearFromDraft, setYearFromDraft] = useState(() => releaseFrom?.slice(0, 4) ?? "");
  const [yearToDraft, setYearToDraft] = useState(() => releaseTo?.slice(0, 4) ?? "");

  function setYearFrom(y: string) {
    setYearFromDraft(y);
    if (y === "") setReleaseFrom("");
    else if (/^\d{4}$/.test(y)) setReleaseFrom(`${y}-01-01`);
    // Partial input (1–3 digits): hold draft locally, leave the
    // canonical state alone so the existing filter doesn't flicker.
  }
  function setYearTo(y: string) {
    setYearToDraft(y);
    if (y === "") setReleaseTo("");
    else if (/^\d{4}$/.test(y)) setReleaseTo(`${y}-12-31`);
  }
  // When the canonical date changes from outside (URL param init,
  // Clear button, mode switch wiping it), keep the draft in sync.
  useEffect(() => {
    setYearFromDraft(releaseFrom ? releaseFrom.slice(0, 4) : "");
  }, [releaseFrom]);
  useEffect(() => {
    setYearToDraft(releaseTo ? releaseTo.slice(0, 4) : "");
  }, [releaseTo]);

  const filterCount =
    selectedGenres.length +
    selectedMpa.length +
    (selectedLanguage ? 1 : 0) +
    (releaseFrom ? 1 : 0) +
    (releaseTo ? 1 : 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-6 h-6 text-[var(--ratist-red)]" />
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

      {/* Filter bar. The header (filters chip + sort dropdown) is
          always visible — the body is collapsible so the page leads
          with the result list, not a wall of filter chips. */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setFiltersExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors"
            aria-expanded={filtersExpanded}
            aria-label={filtersExpanded ? "Collapse filters" : "Expand filters"}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums">
                {filterCount}
              </span>
            )}
            {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {filterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-[var(--foreground-muted)] hover:text-white inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
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

        {filtersExpanded && (
        <div className="space-y-4 pt-2 border-t border-[var(--border)]">

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

        {/* Language dropdown. Single-select — multi-select dropdowns
            are clunky and "all-of-X" composition is rarely useful for
            box office. The 23-chip layout we tried first felt heavy
            against the genre and MPA chips. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] mr-1">Language:</span>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            <option value="">Any</option>
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          {selectedLanguage && (
            <button
              onClick={() => setSelectedLanguage("")}
              className="text-xs text-[var(--foreground-muted)] hover:text-white"
            >
              Clear
            </button>
          )}
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

        {/* Release date range. Year mode is the default — most box-
            office questions naturally bucket by year ("90s blockbusters",
            "everything from 2010"). Specific date mode is opt-in for
            users digging into release-window analysis. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] mr-1">Release:</span>
          <div className="inline-flex bg-[var(--background)] border border-[var(--border)] rounded-md p-0.5">
            <button
              onClick={() => setDateMode("year")}
              className={`px-2 py-0.5 text-xs rounded ${
                dateMode === "year"
                  ? "bg-[var(--ratist-red)] text-white"
                  : "text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              Year
            </button>
            <button
              onClick={() => setDateMode("date")}
              className={`px-2 py-0.5 text-xs rounded ${
                dateMode === "date"
                  ? "bg-[var(--ratist-red)] text-white"
                  : "text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              Specific date
            </button>
          </div>
          {dateMode === "year" ? (
            <>
              <input
                type="number"
                min="1900"
                max="2099"
                placeholder="From"
                value={yearFromDraft}
                onChange={(e) => setYearFrom(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white w-20 focus:outline-none focus:border-[var(--ratist-red)]"
                aria-label="Release year from"
              />
              <span className="text-xs text-[var(--foreground-muted)]">to</span>
              <input
                type="number"
                min="1900"
                max="2099"
                placeholder="To"
                value={yearToDraft}
                onChange={(e) => setYearTo(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white w-20 focus:outline-none focus:border-[var(--ratist-red)]"
                aria-label="Release year to"
              />
            </>
          ) : (
            <>
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
            </>
          )}
          {(releaseFrom || releaseTo) && (
            <button
              onClick={() => { setReleaseFrom(""); setReleaseTo(""); }}
              className="text-xs text-[var(--foreground-muted)] hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
        </div>
        )}
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
