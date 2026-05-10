/**
 * Watchlist streaming-launch notifications.
 *
 * After the daily provider snapshot detects "newly on [provider]"
 * events, this fans them out to each opted-in user whose watchlist
 * contains the launched item. One digest notification per user per
 * day — no spam even if a user has 50 items that all hit on the same
 * day.
 *
 * Opt-in: User.watchlistStreamingNotifs (default false). Membership
 * in any watchlist (default, custom, or shared as collaborator)
 * counts as a match.
 *
 * Idempotency: notifications use a per-day targetId so a re-run on
 * the same calendar day is a no-op via notify()'s 5-minute dedup
 * (the same target landing within 5 min is suppressed). The cron
 * runs once daily, so this is overkill in practice but defends
 * against accidental double-runs.
 */

import { prisma } from "./prisma";
import { notify } from "./notifications";
import { STREAMING_PROVIDERS } from "./tmdb";
import type { StreamingLaunchEvent } from "./releases";

const PROVIDER_NAME_BY_ID = new Map<number, string>(STREAMING_PROVIDERS.map((p) => [p.id, p.short]));

interface MatchedItem {
  title: string;
  providerNames: string[]; // unique providers it launched on today
  mediaType: "movie" | "tv";
  tmdbId: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function notifyWatchlistLaunches(events: StreamingLaunchEvent[]): Promise<{ notified: number; matchedItems: number }> {
  if (events.length === 0) return { notified: 0, matchedItems: 0 };

  // Filter to TODAY's launches only (the cron runs daily, but
  // detectStreamingLaunches looks back further — we don't want to
  // re-notify users about Tuesday's launches on Wednesday).
  const today = todayISO();
  const todayEvents = events.filter((e) => e.launchDate === today);
  if (todayEvents.length === 0) return { notified: 0, matchedItems: 0 };

  // Resolve TMDB IDs → internal Movie / TVShow IDs (one query each).
  const movieTmdbIds = Array.from(new Set(todayEvents.filter((e) => e.mediaType === "movie").map((e) => e.tmdbId)));
  const tvTmdbIds    = Array.from(new Set(todayEvents.filter((e) => e.mediaType === "tv").map((e) => e.tmdbId)));

  const [movies, shows] = await Promise.all([
    movieTmdbIds.length > 0
      ? prisma.movie.findMany({ where: { tmdbId: { in: movieTmdbIds } }, select: { id: true, tmdbId: true, title: true } })
      : Promise.resolve([]),
    tvTmdbIds.length > 0
      ? prisma.tVShow.findMany({ where: { tmdbId: { in: tvTmdbIds } }, select: { id: true, tmdbId: true, name: true } })
      : Promise.resolve([]),
  ]);

  const movieById = new Map(movies.map((m) => [m.id, { tmdbId: m.tmdbId, title: m.title }]));
  const showById  = new Map(shows.map((s) => [s.id, { tmdbId: s.tmdbId, title: s.name }]));
  const movieIds = movies.map((m) => m.id);
  const showIds  = shows.map((s) => s.id);

  // Build (tmdbId+mediaType) → set of providers that launched it today.
  const providersByItem = new Map<string, Set<number>>();
  for (const e of todayEvents) {
    const k = `${e.mediaType}:${e.tmdbId}`;
    if (!providersByItem.has(k)) providersByItem.set(k, new Set());
    providersByItem.get(k)!.add(e.providerId);
  }

  // For each opted-in user, find which of their watchlist items
  // intersect with today's launches. The query joins on the user's
  // owned watchlists AND any list where they're an accepted
  // collaborator — both surfaces should fire the notification since
  // the user explicitly added the item there.
  const optedIn = await prisma.user.findMany({
    where: { watchlistStreamingNotifs: true, deletedAt: null },
    select: { id: true },
  });
  if (optedIn.length === 0) return { notified: 0, matchedItems: 0 };

  let notified = 0;
  let matchedItems = 0;

  for (const u of optedIn) {
    const matches: MatchedItem[] = [];

    if (movieIds.length > 0) {
      const wlMovies = await prisma.watchlistMovie.findMany({
        where: {
          movieId: { in: movieIds },
          watchlist: {
            OR: [
              { userId: u.id },
              { collaborators: { some: { userId: u.id, status: "accepted" } } },
            ],
          },
        },
        select: { movieId: true },
      });
      const seen = new Set<number>();
      for (const wm of wlMovies) {
        const m = movieById.get(wm.movieId);
        if (!m || seen.has(m.tmdbId)) continue;
        seen.add(m.tmdbId);
        const providerSet = providersByItem.get(`movie:${m.tmdbId}`) ?? new Set();
        const providerNames = Array.from(providerSet)
          .map((pid) => PROVIDER_NAME_BY_ID.get(pid))
          .filter((n): n is string => !!n);
        if (providerNames.length === 0) continue;
        matches.push({ title: m.title, providerNames, mediaType: "movie", tmdbId: m.tmdbId });
      }
    }

    if (showIds.length > 0) {
      const wlShows = await prisma.watchlistShow.findMany({
        where: {
          tvShowId: { in: showIds },
          watchlist: {
            OR: [
              { userId: u.id },
              { collaborators: { some: { userId: u.id, status: "accepted" } } },
            ],
          },
        },
        select: { tvShowId: true },
      });
      const seen = new Set<number>();
      for (const ws of wlShows) {
        const s = showById.get(ws.tvShowId);
        if (!s || seen.has(s.tmdbId)) continue;
        seen.add(s.tmdbId);
        const providerSet = providersByItem.get(`tv:${s.tmdbId}`) ?? new Set();
        const providerNames = Array.from(providerSet)
          .map((pid) => PROVIDER_NAME_BY_ID.get(pid))
          .filter((n): n is string => !!n);
        if (providerNames.length === 0) continue;
        matches.push({ title: s.title, providerNames, mediaType: "tv", tmdbId: s.tmdbId });
      }
    }

    if (matches.length === 0) continue;
    matchedItems += matches.length;

    // Build the digest message. Cap at 3 named items to keep the
    // notification scannable; the rest are summarized.
    const head = matches.slice(0, 3);
    const rest = matches.length - head.length;
    const titlesPart = head
      .map((m) => `${m.title} (${m.providerNames.join(", ")})`)
      .join("; ");
    const message = matches.length === 1
      ? `${head[0].title} is now streaming on ${head[0].providerNames.join(", ")}.`
      : rest > 0
        ? `${matches.length} watchlist items started streaming today: ${titlesPart}, and ${rest} more.`
        : `${matches.length} watchlist items started streaming today: ${titlesPart}.`;

    // Single-digest target id keyed by date so the 5-min cooldown in
    // notify() suppresses an accidental double-fire on the same day.
    await notify({
      recipientId: u.id,
      actorId: null,
      type: "watchlist_streaming",
      targetType: "watchlist_streaming",
      targetId: `digest:${today}`,
      message,
      link: "/watchlist",
    }).catch(() => { /* non-critical */ });

    notified++;
  }

  return { notified, matchedItems };
}
