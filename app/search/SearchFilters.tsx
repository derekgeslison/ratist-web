"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, LayoutGrid, List } from "lucide-react";
import { LANGUAGES } from "@/lib/tmdb";
import Link from "next/link";

type TypeFilter = "all" | "movies" | "shows" | "people" | "editorial";
type SortMode = "relevance" | "popular" | "rating" | "newest" | "oldest" | "az" | "za";

interface Props {
  currentType: TypeFilter;
  currentSort: SortMode;
  currentPerPage: string;
  currentQuery: string;
  genres: { id: number; name: string }[];
}

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];

export default function SearchFilters({ currentType, currentSort, currentPerPage, currentQuery, genres }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const defaults: Record<string, string> = { perPage: "20", type: "all", sort: "relevance", language: "", genre: "", yearFrom: "", yearTo: "", view: "" };
    if (value === (defaults[key] ?? "")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/search?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", searchInput.trim());
    router.push(`/search?${params.toString()}`);
  }

  const typeOptions: { label: string; value: TypeFilter }[] = [
    { label: "All", value: "all" },
    { label: "Movies", value: "movies" },
    { label: "TV Shows", value: "shows" },
    { label: "People", value: "people" },
    { label: "Blogs & Community", value: "editorial" },
  ];

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: "Relevance", value: "relevance" },
    { label: "Most Popular", value: "popular" },
    { label: "Top Rated", value: "rating" },
    { label: "Newest First", value: "newest" },
    { label: "Oldest First", value: "oldest" },
    { label: "Title A–Z", value: "az" },
    { label: "Title Z–A", value: "za" },
  ];

  // Genre / year / language filters apply to TMDB results only — they
  // make no sense for People or Blogs & Community.
  const showContentFilters = currentType !== "people" && currentType !== "editorial";
  const view = searchParams.get("view") ?? "list";

  return (
    <div className="space-y-4 mb-6">
      {/* Advanced filtering hint */}
      <p className="text-xs text-[var(--foreground-muted)]">
        Need more filters? Browse{" "}
        <Link href="/movies" className="text-[var(--ratist-red)] hover:underline">Movies & TV</Link>
        {" "}or{" "}
        <Link href="/celebrities" className="text-[var(--ratist-red)] hover:underline">Celebrities</Link>
        {" "}for advanced filtering options. For AI search, head to{" "}
        <Link href="/movies" className="text-[var(--ratist-red)] hover:underline">Movies & TV</Link>.
      </p>

      {/* Inline search bar */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search movies, shows & people..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
        <button type="submit"
          className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors flex-shrink-0">
          Search
        </button>
      </form>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
        {/* Type filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {typeOptions.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => updateParam("type", value)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                currentType === value
                  ? "bg-[var(--ratist-red)] text-white"
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort select */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] shrink-0">Sort:</span>
          <select
            value={currentSort}
            onChange={(e) => updateParam("sort", e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] transition-colors appearance-none cursor-pointer"
          >
            {sortOptions.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Genre filter */}
        {showContentFilters && genres.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--foreground-muted)] shrink-0">Genre:</span>
            <select
              value={searchParams.get("genre") ?? ""}
              onChange={(e) => updateParam("genre", e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">Any</option>
              {genres.map((g) => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Year range */}
        {showContentFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--foreground-muted)] shrink-0">Year:</span>
            <input
              type="number"
              min="1900"
              max="2030"
              placeholder="From"
              value={searchParams.get("yearFrom") ?? ""}
              onChange={(e) => updateParam("yearFrom", e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
            <span className="text-xs text-[var(--foreground-muted)]">–</span>
            <input
              type="number"
              min="1900"
              max="2030"
              placeholder="To"
              value={searchParams.get("yearTo") ?? ""}
              onChange={(e) => updateParam("yearTo", e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
          </div>
        )}

        {/* Language filter */}
        {showContentFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--foreground-muted)] shrink-0">Language:</span>
            <select
              value={searchParams.get("language") ?? ""}
              onChange={(e) => updateParam("language", e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">Any</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Per page select */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] shrink-0">Show:</span>
          <select
            value={currentPerPage}
            onChange={(e) => updateParam("perPage", e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] transition-colors appearance-none cursor-pointer"
          >
            {PER_PAGE_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid / List toggle */}
        {showContentFilters && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => updateParam("view", "list")}
              className={`p-1.5 rounded transition-colors ${view === "list" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => updateParam("view", "grid")}
              className={`p-1.5 rounded transition-colors ${view === "grid" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
