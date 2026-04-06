"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { LANGUAGES } from "@/lib/tmdb";

type TypeFilter = "all" | "movies" | "shows" | "people";
type SortMode = "relevance" | "rating" | "az";

interface Props {
  currentType: TypeFilter;
  currentSort: SortMode;
  currentPerPage: string;
  currentQuery: string;
}

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];

export default function SearchFilters({ currentType, currentSort, currentPerPage, currentQuery }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if ((value === "20" && key === "perPage") || (value === "all" && key === "type") || (value === "relevance" && key === "sort") || (value === "" && key === "language")) {
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
  ];

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: "By Relevance", value: "relevance" },
    { label: "By Rating", value: "rating" },
    { label: "A–Z", value: "az" },
  ];

  return (
    <div className="space-y-4 mb-6">
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

        {/* Language filter */}
        {(currentType === "all" || currentType === "movies" || currentType === "shows") && (
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
      </div>
    </div>
  );
}
