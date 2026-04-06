"use client";

import { useState, useEffect, useMemo } from "react";
import { Tv, Film as FilmIcon } from "lucide-react";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import type { TMDBMovie, TMDBShow } from "@/lib/tmdb";

export interface Credit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  character?: string;
  jobs?: string[];       // all crew roles for this title
  popularity: number;
  mediaType?: "movie" | "tv";
}

const PAGE_SIZE = 20;

export default function CelebrityCreditsSection({
  credits,
  personId,
}: {
  credits: Credit[];
  personId?: number;
}) {
  const storageKey = personId ? `celeb-credits-${personId}` : null;

  const [shown, setShown] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return PAGE_SIZE;
    try { return Number(sessionStorage.getItem(`${storageKey}-shown`)) || PAGE_SIZE; } catch { return PAGE_SIZE; }
  });
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">(() => {
    if (typeof window === "undefined" || !storageKey) return "all";
    try { return (sessionStorage.getItem(`${storageKey}-filter`) as "all" | "movie" | "tv") || "all"; } catch { return "all"; }
  });
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`${storageKey}-shown`, String(shown));
      sessionStorage.setItem(`${storageKey}-filter`, mediaFilter);
    } catch { /* ignore */ }
  }, [shown, mediaFilter, storageKey]);

  const hasMovies = credits.some((c) => c.mediaType !== "tv");
  const hasShows = credits.some((c) => c.mediaType === "tv");
  const showMediaToggle = hasMovies && hasShows;

  // Collect unique roles for filtering: "Actor" if any have character, plus all crew jobs
  const availableRoles = useMemo(() => {
    const roles: string[] = [];
    const hasActing = credits.some((c) => c.character);
    if (hasActing) roles.push("Actor");
    const jobSet = new Set<string>();
    for (const c of credits) {
      for (const j of c.jobs ?? []) {
        if (!jobSet.has(j)) { jobSet.add(j); roles.push(j); }
      }
    }
    return roles;
  }, [credits]);
  const showRoleFilter = availableRoles.length > 1;

  // Apply media filter
  let filtered = mediaFilter === "all" ? credits : credits.filter((c) => (c.mediaType ?? "movie") === mediaFilter);

  // Apply role filter
  if (roleFilter === "Actor") {
    filtered = filtered.filter((c) => c.character);
  } else if (roleFilter !== "all") {
    filtered = filtered.filter((c) => c.jobs?.includes(roleFilter));
  }

  const visible = filtered.slice(0, shown);
  const hasMore = shown < filtered.length;

  // Determine display label for each credit based on active role filter
  function getRoleLabel(item: Credit): string | undefined {
    if (roleFilter === "all" || roleFilter === "Actor") {
      // Default: show character name if they acted, otherwise first crew job
      return item.character || item.jobs?.[0];
    }
    // Specific crew filter: show that role
    return roleFilter;
  }

  return (
    <div>
      {/* Media type toggle */}
      {showMediaToggle && (
        <div className="flex items-center gap-1 mb-4">
          {([
            { value: "all" as const, label: "All" },
            { value: "movie" as const, label: "Movies", icon: FilmIcon },
            { value: "tv" as const, label: "TV", icon: Tv },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setMediaFilter(value); setShown(PAGE_SIZE); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                mediaFilter === value
                  ? value === "tv" ? "bg-blue-600/20 border border-blue-500/40 text-blue-400" : "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white"
                  : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Role filter */}
      {showRoleFilter && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mr-1">Role:</span>
          <button
            onClick={() => { setRoleFilter("all"); setShown(PAGE_SIZE); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              roleFilter === "all" ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >All</button>
          {availableRoles.map((role) => (
            <button
              key={role}
              onClick={() => { setRoleFilter(role); setShown(PAGE_SIZE); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                roleFilter === role ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >{role}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 mb-4">
        {visible.map((item, idx) => {
          const isTV = item.mediaType === "tv";
          const roleLabel = getRoleLabel(item);
          if (isTV) {
            return (
              <ShowCard
                key={`${item.id}-tv-${idx}`}
                show={{ id: item.id, name: item.title, poster_path: item.poster_path, vote_average: item.vote_average, first_air_date: item.release_date, backdrop_path: null, overview: "", genre_ids: [], popularity: item.popularity, vote_count: 0 } as unknown as TMDBShow}
                characterName={roleLabel}
              />
            );
          }
          return (
            <MovieCard
              key={`${item.id}-m-${idx}`}
              movie={{ id: item.id, title: item.title, poster_path: item.poster_path, vote_average: item.vote_average, release_date: item.release_date, backdrop_path: null, overview: "", genre_ids: [], popularity: item.popularity, vote_count: 0 } as unknown as TMDBMovie}
              characterName={roleLabel}
            />
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShown((s) => Math.min(s + PAGE_SIZE, filtered.length))}
          className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
        >
          Show more ({filtered.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
