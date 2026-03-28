"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for: { id: number; title?: string; name?: string; media_type: string }[];
}

interface Props {
  people: TMDBPerson[];
  currentDept?: string;
}

type SortMode = "popularity" | "az";

export default function CelebritiesResults({ people, currentDept }: Props) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popularity");

  let filtered = people.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  if (sortMode === "az") {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div>
      {/* Search + sort controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${currentDept ? currentDept.toLowerCase() + "s" : "celebrities"}...`}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)] shrink-0">Sort:</span>
          <button
            onClick={() => setSortMode("popularity")}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              sortMode === "popularity"
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Popularity
          </button>
          <button
            onClick={() => setSortMode("az")}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              sortMode === "az"
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            A–Z
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-[var(--foreground-muted)] py-10 text-center">
          No results{query ? ` for "${query}"` : ""}.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((person) => (
            <Link
              key={person.id}
              href={`/celebrities/${person.id}`}
              className="group flex flex-col items-center text-center"
            >
              <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-2">
                {person.profile_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                    alt={person.name}
                    fill
                    sizes="160px"
                    className="object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--foreground-muted)]">
                    &#x1F464;
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                {person.name}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mb-1">
                {person.known_for_department}
              </p>
              {person.known_for.length > 0 && (
                <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 opacity-70">
                  {person.known_for
                    .map((k) => k.title ?? k.name)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
