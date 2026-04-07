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
  return d.toISOString().slice(0, 10);
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

  // Get existing week numbers
  const existing = await prisma.movieClubWeek.findMany({
    select: { weekNumber: true, startDate: true },
    orderBy: { weekNumber: "desc" },
  });

  const existingDates = new Set(existing.map((w) => w.startDate));
  const lastWeekNum = existing.length > 0 ? Math.max(...existing.map((w) => w.weekNumber)) : 0;
  let nextNum = lastWeekNum + 1;

  // Generate weeks for this week + next 3 weeks (4 total)
  for (let i = 0; i < 4; i++) {
    const monday = addDays(thisMonday, i * 7);
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

/** Run automatic status transitions based on current Eastern time */
export async function runStatusTransitions(): Promise<void> {
  const now = getEasternNow();
  const today = formatDate(now);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const hour = now.getHours();

  const allWeeks = await prisma.movieClubWeek.findMany({
    orderBy: { weekNumber: "asc" },
  });

  for (const week of allWeeks) {
    // Archive past weeks: if it's a new Monday and this week's endDate has passed
    if (week.status === "discussion" && today > week.endDate) {
      await prisma.movieClubWeek.update({
        where: { id: week.id },
        data: { status: "archived" },
      });
      continue;
    }

    // Community vote weeks: Mon-Tue = voting phase
    if (week.status === "scheduled" && week.pickMethod === "community_vote" && week.startDate === today && dayOfWeek === 1) {
      await prisma.movieClubWeek.update({
        where: { id: week.id },
        data: { status: "voting" },
      });
      continue;
    }

    // Community vote: Wed 2am ET = auto-select winner and start watching
    if (week.status === "voting" && dayOfWeek === 3 && hour >= 2) {
      await resolveVoteAndStartWatching(week.id);
      continue;
    }

    // Random/Admin weeks: Monday = start watching (auto-pick if random and no movie yet)
    if (week.status === "scheduled" && week.startDate <= today && week.pickMethod !== "community_vote") {
      if (week.pickMethod === "random" && !week.movieId) {
        await pickRandomAndAssign(week.id, week.pickFilters as Record<string, string> | null);
      }
      if (week.movieId || week.movieTmdbId) {
        await prisma.movieClubWeek.update({
          where: { id: week.id },
          data: { status: "watching" },
        });
      }
      continue;
    }

    // Friday 8pm ET = open discussion
    if (week.status === "watching" && dayOfWeek === 5 && hour >= 20) {
      await prisma.movieClubWeek.update({
        where: { id: week.id },
        data: { status: "discussion" },
      });
    }
  }
}

// ─── Random movie picker ─────────────────────────────────────────────────────

export async function pickRandomMovie(filters?: Record<string, string> | null): Promise<{ tmdbId: number; title: string; posterPath: string | null } | null> {
  const params = new URLSearchParams({
    api_key: API_KEY!,
    sort_by: "popularity.desc",
    "vote_count.gte": "1000",
    include_adult: "false",
    with_original_language: "en",
    "primary_release_date.gte": "1970-01-01",
    page: String(Math.floor(Math.random() * 10) + 1),
  });

  if (filters?.genre) params.set("with_genres", filters.genre);
  if (filters?.provider) { params.set("with_watch_providers", filters.provider); params.set("watch_region", "US"); }
  if (filters?.yearFrom) params.set("primary_release_date.gte", `${filters.yearFrom}-01-01`);
  if (filters?.yearTo) params.set("primary_release_date.lte", `${filters.yearTo}-12-31`);
  if (filters?.mpaRating) { params.set("certification_country", "US"); params.set("certification", filters.mpaRating); }

  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params}`);
    const data = await res.json();
    const results = data.results ?? [];
    if (results.length === 0) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return { tmdbId: pick.id, title: pick.title, posterPath: pick.poster_path };
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
