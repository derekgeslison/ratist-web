/**
 * Backfill MPAA ratings for all cached movies and TV content ratings for all cached shows.
 * Run with: npx tsx scripts/backfill-certifications.ts
 */

import { prisma } from "../lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

async function backfillMovies() {
  // Get top movies by popularity and top by rating, merge and dedupe
  const [byPop, byRating] = await Promise.all([
    prisma.movie.findMany({ where: { mpaaRating: null }, select: { id: true, tmdbId: true, title: true }, orderBy: { popularity: "desc" }, take: 10000 }),
    prisma.movie.findMany({ where: { mpaaRating: null, voteAverage: { not: null } }, select: { id: true, tmdbId: true, title: true }, orderBy: { voteAverage: "desc" }, take: 10000 }),
  ]);
  const seen = new Set<string>();
  const movies: typeof byPop = [];
  for (const m of [...byPop, ...byRating]) {
    if (!seen.has(m.id)) { seen.add(m.id); movies.push(m); }
  }
  console.log(`Found ${movies.length} movies without MPAA rating`);

  let updated = 0;
  for (const movie of movies) {
    try {
      const res = await fetch(`${BASE}/movie/${movie.tmdbId}/release_dates?api_key=${API_KEY}`);
      if (!res.ok) continue;
      const data = await res.json();
      const usRelease = data.results?.find((r: any) => r.iso_3166_1 === "US");
      if (!usRelease) continue;
      const rated = usRelease.release_dates.find((d: any) => d.certification && d.type === 3)
        ?? usRelease.release_dates.find((d: any) => d.certification);
      if (!rated?.certification) continue;

      await prisma.movie.update({
        where: { id: movie.id },
        data: { mpaaRating: rated.certification },
      });
      updated++;
      if (updated % 50 === 0) console.log(`  Updated ${updated} movies...`);
    } catch (err) {
      // Rate limit or network error — wait and continue
      await new Promise((r) => setTimeout(r, 500));
    }
    // TMDB rate limit: ~40 requests per 10 seconds
    await new Promise((r) => setTimeout(r, 260));
  }
  console.log(`Updated ${updated} / ${movies.length} movies with MPAA ratings`);
}

async function backfillShows() {
  const [showsByPop, showsByRating] = await Promise.all([
    prisma.tVShow.findMany({ where: { contentRating: null }, select: { id: true, tmdbId: true, name: true }, orderBy: { popularity: "desc" }, take: 5000 }),
    prisma.tVShow.findMany({ where: { contentRating: null, voteAverage: { not: null } }, select: { id: true, tmdbId: true, name: true }, orderBy: { voteAverage: "desc" }, take: 5000 }),
  ]);
  const seenShows = new Set<string>();
  const shows: typeof showsByPop = [];
  for (const s of [...showsByPop, ...showsByRating]) {
    if (!seenShows.has(s.id)) { seenShows.add(s.id); shows.push(s); }
  }
  console.log(`Found ${shows.length} shows without content rating`);

  let updated = 0;
  for (const show of shows) {
    try {
      const res = await fetch(`${BASE}/tv/${show.tmdbId}/content_ratings?api_key=${API_KEY}`);
      if (!res.ok) continue;
      const data = await res.json();
      const usRating = data.results?.find((r: any) => r.iso_3166_1 === "US");
      if (!usRating?.rating) continue;

      await prisma.tVShow.update({
        where: { id: show.id },
        data: { contentRating: usRating.rating },
      });
      updated++;
      if (updated % 50 === 0) console.log(`  Updated ${updated} shows...`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 260));
  }
  console.log(`Updated ${updated} / ${shows.length} shows with content ratings`);
}

async function main() {
  console.log("Backfilling certifications...\n");
  await backfillMovies();
  console.log("");
  await backfillShows();
  console.log("\nDone!");
  await prisma.$disconnect();
}

main().catch(console.error);
