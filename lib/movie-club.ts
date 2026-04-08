/**
 * Movie Club automation: week generation, status transitions, random movie selection.
 * All time-based logic uses Eastern Time.
 */

import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;

// ─── Time helpers (Eastern) ──────────────────────────────────────────────────

export function getEasternNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

export function getEasternDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Get the Monday of the week containing the given date */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

// ─── Auto-generate upcoming weeks ───────────────────────────────────────────

/** Ensure the next 4 weeks exist in the database. Creates with default random pick method. */
export async function ensureUpcomingWeeks(): Promise<void> {
  const now = getEasternNow();
  const thisMonday = getMonday(now);
  // If today is before Monday (Sun), use this coming Monday. If Mon or later, use this Monday.
  const dayOfWeek = now.getDay();
  const startFrom = dayOfWeek === 0 ? addDays(thisMonday, 7) : thisMonday;

  const existing = await prisma.movieClubWeek.findMany({
    select: { weekNumber: true, startDate: true },
    orderBy: { weekNumber: "desc" },
  });

  const existingDates = new Set(existing.map((w) => w.startDate));
  const lastWeekNum = existing.length > 0 ? Math.max(...existing.map((w) => w.weekNumber)) : 0;
  let nextNum = lastWeekNum + 1;

  // Generate this week + next 5 weeks (6 total)
  for (let i = 0; i < 6; i++) {
    const monday = addDays(startFrom, i * 7);
    const startDate = formatDate(monday);

    if (!existingDates.has(startDate)) {
      const sunday = addDays(monday, 6);
      await prisma.movieClubWeek.create({
        data: {
          weekNumber: nextNum++,
          startDate,
          endDate: formatDate(sunday),
          status: "scheduled",
          pickMethod: "random",
        },
      });
    }
  }
}

// ─── Status transitions ─────────────────────────────────────────────────────

/** Run automatic status transitions based on current Eastern time.
 *  Only transitions forward in the lifecycle. Never reverts status.
 *  Admin can override status manually — auto-transitions only apply
 *  when the current status matches the expected "from" state. */
export async function runStatusTransitions(): Promise<void> {
  const now = getEasternNow();
  const today = formatDate(now);
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  // Only process weeks that might need transitioning
  const activeWeeks = await prisma.movieClubWeek.findMany({
    where: { status: { in: ["scheduled", "voting", "watching", "discussion"] } },
    orderBy: { weekNumber: "asc" },
  });

  for (const week of activeWeeks) {
    // Archive: discussion phase ended (past end date)
    if (week.status === "discussion" && today > week.endDate) {
      await prisma.movieClubWeek.update({ where: { id: week.id }, data: { status: "archived" } });
      continue;
    }

    // Only auto-transition from "scheduled" — if admin already moved it to watching/discussion/etc, don't touch it
    if (week.status === "scheduled" && week.startDate <= today) {
      if (week.pickMethod === "community_vote") {
        // Community vote: scheduled → voting
        await prisma.movieClubWeek.update({ where: { id: week.id }, data: { status: "voting" } });
      } else {
        // Random/Admin: scheduled → watching (auto-pick random if needed)
        if (week.pickMethod === "random" && !week.movieId) {
          await pickRandomAndAssign(week.id, week.pickFilters as Record<string, string> | null);
        }
        // Re-fetch to get updated movieId
        const updated = await prisma.movieClubWeek.findUnique({ where: { id: week.id } });
        if (updated?.movieId) {
          await prisma.movieClubWeek.update({ where: { id: week.id }, data: { status: "watching" } });
        }
      }
      continue;
    }

    // Community vote: voting → watching (Wed 2am ET or later — catches missed crons)
    if (week.status === "voting" && (dayOfWeek >= 3 || dayOfWeek === 0) && (dayOfWeek > 3 || dayOfWeek === 0 || hour >= 2)) {
      await resolveVoteAndStartWatching(week.id);
      continue;
    }

    // Watching → Discussion (Fri 8pm ET or later — catches missed crons)
    if (week.status === "watching" && (dayOfWeek > 5 || (dayOfWeek === 5 && hour >= 20) || dayOfWeek === 0)) {
      await prisma.movieClubWeek.update({ where: { id: week.id }, data: { status: "discussion" } });
    }
  }
}

// ─── Random movie picker ─────────────────────────────────────────────────────

export async function pickRandomMovie(filters?: Record<string, string> | null): Promise<{ tmdbId: number; title: string; posterPath: string | null; year?: string; voteAverage?: number } | null> {
  // Popularity thresholds (vote_count ranges)
  const POP_RANGES: Record<string, { min: number; max?: number; pages: number }> = {
    blockbuster: { min: 5000, pages: 10 },
    popular:     { min: 2000, max: 5000, pages: 8 },
    known:       { min: 1000, max: 2000, pages: 6 },
    moderate:    { min: 500, max: 1000, pages: 5 },
    hidden_gem:  { min: 200, max: 500, pages: 4 },
  };

  const pop = filters?.popularity ? POP_RANGES[filters.popularity] : null;
  const voteMin = pop?.min ?? 1000;
  const maxPages = pop?.pages ?? 10;

  const params = new URLSearchParams({
    api_key: API_KEY!,
    sort_by: pop ? "vote_average.desc" : "popularity.desc",
    "vote_count.gte": String(voteMin),
    include_adult: "false",
    with_original_language: "en",
    "primary_release_date.gte": "1970-01-01",
    page: String(Math.floor(Math.random() * maxPages) + 1),
  });
  if (pop?.max) params.set("vote_count.lte", String(pop.max));

  if (filters?.genre) params.set("with_genres", filters.genre);
  if (filters?.provider) { params.set("with_watch_providers", filters.provider); params.set("watch_region", "US"); }
  if (filters?.yearFrom) params.set("primary_release_date.gte", `${filters.yearFrom}-01-01`);
  if (filters?.yearTo) params.set("primary_release_date.lte", `${filters.yearTo}-12-31`);
  if (filters?.mpaRating) { params.set("certification_country", "US"); params.set("certification", filters.mpaRating); }

  try {
    let res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params}`);
    let data = await res.json();
    let results = data.results ?? [];
    // If random page returned 0 results, try page 1
    if (results.length === 0) {
      params.set("page", "1");
      res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params}`);
      data = await res.json();
      results = data.results ?? [];
    }
    if (results.length === 0) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return { tmdbId: pick.id, title: pick.title, posterPath: pick.poster_path, year: pick.release_date?.slice(0, 4) ?? "", voteAverage: pick.vote_average ?? 0 };
  } catch {
    return null;
  }
}

async function pickRandomAndAssign(weekId: string, filters: Record<string, string> | null): Promise<void> {
  const picked = await pickRandomMovie(filters);
  if (!picked) return;

  const movie = await prisma.movie.upsert({
    where: { tmdbId: picked.tmdbId },
    create: { tmdbId: picked.tmdbId, title: picked.title, posterPath: picked.posterPath },
    update: {},
  });

  await prisma.movieClubWeek.update({
    where: { id: weekId },
    data: { movieId: movie.id, movieTmdbId: picked.tmdbId, movieTitle: picked.title, moviePoster: picked.posterPath },
  });
}

// ─── Community vote resolution ───────────────────────────────────────────────

/** Resolve the community vote winner and assign the movie (without changing status) */
export async function resolveVoteWinner(weekId: string): Promise<void> {
  const nominations = await prisma.movieClubNomination.findMany({
    where: { weekId },
    include: { _count: { select: { votes: true } } },
  });

  if (nominations.length === 0) {
    await pickRandomAndAssign(weekId, null);
    return;
  }

  const sorted = nominations.sort((a, b) => b._count.votes - a._count.votes || Math.random() - 0.5);
  const winner = sorted[0];

  const movie = await prisma.movie.upsert({
    where: { tmdbId: winner.tmdbId },
    create: { tmdbId: winner.tmdbId, title: winner.title, posterPath: winner.posterPath },
    update: {},
  });

  await prisma.movieClubWeek.update({
    where: { id: weekId },
    data: { movieId: movie.id, movieTmdbId: winner.tmdbId, movieTitle: winner.title, moviePoster: winner.posterPath },
  });
}

async function resolveVoteAndStartWatching(weekId: string): Promise<void> {
  // Count votes per nomination
  const nominations = await prisma.movieClubNomination.findMany({
    where: { weekId },
    include: { _count: { select: { votes: true } } },
  });

  if (nominations.length === 0) {
    // No nominations — fall back to random
    await pickRandomAndAssign(weekId, null);
  } else {
    // Sort by votes desc, then random for ties
    const sorted = nominations.sort((a, b) => b._count.votes - a._count.votes || Math.random() - 0.5);
    const winner = sorted[0];

    const movie = await prisma.movie.upsert({
      where: { tmdbId: winner.tmdbId },
      create: { tmdbId: winner.tmdbId, title: winner.title, posterPath: winner.posterPath },
      update: {},
    });

    await prisma.movieClubWeek.update({
      where: { id: weekId },
      data: { movieId: movie.id, movieTmdbId: winner.tmdbId, movieTitle: winner.title, moviePoster: winner.posterPath, status: "watching" },
    });
    return;
  }

  await prisma.movieClubWeek.update({
    where: { id: weekId },
    data: { status: "watching" },
  });
}

// ─── Superlatives ────────────────────────────────────────────────────────────

export interface Superlative {
  label: string;
  userName: string;
  userAvatar: string | null;
  userUid: string;
  value: string;
}

export async function getSuperlatives(weekId: string): Promise<Superlative[]> {
  const ratings = await prisma.movieClubRating.findMany({
    where: { weekId },
    include: { user: { select: { name: true, avatarUrl: true, firebaseUid: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (ratings.length === 0) return [];

  const superlatives: Superlative[] = [];
  const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;

  // First to submit
  const first = ratings[0];
  superlatives.push({ label: "First Reviewer", userName: first.user.name, userAvatar: first.user.avatarUrl, userUid: first.user.firebaseUid, value: `${first.rating}/10` });

  // Highest rater
  const highest = ratings.reduce((a, b) => a.rating >= b.rating ? a : b);
  superlatives.push({ label: "Highest Rater", userName: highest.user.name, userAvatar: highest.user.avatarUrl, userUid: highest.user.firebaseUid, value: `${highest.rating}/10` });

  // Lowest rater
  const lowest = ratings.reduce((a, b) => a.rating <= b.rating ? a : b);
  superlatives.push({ label: "Lowest Rater", userName: lowest.user.name, userAvatar: lowest.user.avatarUrl, userUid: lowest.user.firebaseUid, value: `${lowest.rating}/10` });

  // Closest to average (In Sync)
  const closest = ratings.reduce((a, b) => Math.abs(a.rating - avg) <= Math.abs(b.rating - avg) ? a : b);
  superlatives.push({ label: "In Sync", userName: closest.user.name, userAvatar: closest.user.avatarUrl, userUid: closest.user.firebaseUid, value: `${closest.rating}/10 (avg ${avg.toFixed(1)})` });

  // Furthest from average (Contrarian)
  const furthest = ratings.reduce((a, b) => Math.abs(a.rating - avg) >= Math.abs(b.rating - avg) ? a : b);
  if (furthest.userId !== closest.userId) {
    superlatives.push({ label: "Contrarian", userName: furthest.user.name, userAvatar: furthest.user.avatarUrl, userUid: furthest.user.firebaseUid, value: `${furthest.rating}/10` });
  }

  // Most detailed review
  const detailed = ratings.filter((r) => r.reviewText).sort((a, b) => (b.reviewText?.length ?? 0) - (a.reviewText?.length ?? 0));
  if (detailed.length > 0) {
    superlatives.push({ label: "Most Detailed Review", userName: detailed[0].user.name, userAvatar: detailed[0].user.avatarUrl, userUid: detailed[0].user.firebaseUid, value: `${detailed[0].reviewText!.length} chars` });
  }

  // Speed Watcher (fastest to submit, measured from the week's start)
  superlatives.push({ label: "Speed Watcher", userName: first.user.name, userAvatar: first.user.avatarUrl, userUid: first.user.firebaseUid, value: "First to finish" });

  // Rewatch count
  const rewatchers = ratings.filter((r) => r.isRewatch);
  if (rewatchers.length > 0) {
    superlatives.push({ label: "Rewatchers", userName: `${rewatchers.length} member${rewatchers.length !== 1 ? "s" : ""}`, userAvatar: null, userUid: "", value: "Already seen it" });
  }

  return superlatives;
}
