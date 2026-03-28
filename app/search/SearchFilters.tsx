"use client";

import { useRouter, useSearchParams } from "next/navigation";

type TypeFilter = "all" | "movies" | "people";
type SortMode = "relevance" | "rating" | "az";

interface Props {
  currentType: TypeFilter;
  currentSort: SortMode;
  currentPerPage: string;
}

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];

export default function SearchFilters({ currentType, currentSort, currentPerPage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "20" && key === "perPage") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/search?${params.toString()}`);
  }

  const typeOptions: { label: string; value: TypeFilter }[] = [
    { label: "All", value: "all" },
    { label: "Movies", value: "movies" },
    { label: "People", value: "people" },
  ];

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: "By Relevance", value: "relevance" },
    { label: "By Rating", value: "rating" },
    { label: "A–Z", value: "az" },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap items-center">
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
  );
}
