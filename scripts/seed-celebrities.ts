/**
 * One-time script to seed the Celebrity table with birthday data.
 * Run with: npx tsx scripts/seed-celebrities.ts
 *
 * Fetches cast from top-rated and popular movies/shows across many pages,
 * then fetches person details to get birthday data.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) { console.error("TMDB_API_KEY not set"); process.exit(1); }

async function fetchJSON(url: string) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

async function main() {
  const personIds = new Set<number>();

  // Gather person IDs from many movies and shows
  console.log("Fetching movie/show credits...");

  const sources = [
    ...Array.from({ length: 10 }, (_, i) => ({ type: "movie", endpoint: "popular", page: i + 1 })),
    ...Array.from({ length: 10 }, (_, i) => ({ type: "movie", endpoint: "top_rated", page: i + 1 })),
    ...Array.from({ length: 5 }, (_, i) => ({ type: "tv", endpoint: "popular", page: i + 1 })),
    ...Array.from({ length: 5 }, (_, i) => ({ type: "tv", endpoint: "top_rated", page: i + 1 })),
  ];

  for (const { type, endpoint, page } of sources) {
    const data = await fetchJSON(`https://api.themoviedb.org/3/${type}/${endpoint}?api_key=${API_KEY}&page=${page}`);
    if (!data?.results) continue;

    for (const item of data.results.slice(0, 20)) {
      const credits = await fetchJSON(`https://api.themoviedb.org/3/${type}/${item.id}/credits?api_key=${API_KEY}`);
      if (!credits?.cast) continue;
      for (const actor of credits.cast.slice(0, 10)) {
        personIds.add(actor.id);
      }
    }
    console.log(`  ${type}/${endpoint} page ${page}: ${personIds.size} unique people so far`);
  }

  // Also add trending people
  for (let page = 1; page <= 10; page++) {
    const data = await fetchJSON(`https://api.themoviedb.org/3/trending/person/week?api_key=${API_KEY}&page=${page}`);
    for (const p of data?.results ?? []) personIds.add(p.id);
  }

  console.log(`Total unique people to process: ${personIds.size}`);

  // Fetch person details and cache
  const ids = Array.from(personIds);
  let saved = 0;
  let withBirthday = 0;

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const details = await Promise.all(
      batch.map((id) => fetchJSON(`https://api.themoviedb.org/3/person/${id}?api_key=${API_KEY}`))
    );

    for (const person of details) {
      if (!person?.id) continue;
      try {
        await prisma.celebrity.upsert({
          where: { tmdbId: person.id },
          create: {
            tmdbId: person.id,
            name: person.name,
            profilePath: person.profile_path ?? null,
            knownForDepartment: person.known_for_department ?? null,
            birthday: person.birthday ?? null,
            deathday: person.deathday ?? null,
            placeOfBirth: person.place_of_birth ?? null,
            biography: person.biography?.slice(0, 5000) ?? null,
            popularity: person.popularity ?? null,
            cachedAt: new Date(),
          },
          update: {
            name: person.name,
            profilePath: person.profile_path ?? null,
            birthday: person.birthday ?? null,
            deathday: person.deathday ?? null,
            popularity: person.popularity ?? null,
            cachedAt: new Date(),
          },
        });
        saved++;
        if (person.birthday) withBirthday++;
      } catch { /* skip duplicates */ }
    }

    if ((i + 20) % 200 === 0) {
      console.log(`  Processed ${i + 20}/${ids.length} — ${saved} saved, ${withBirthday} with birthdays`);
    }

    // Small delay to respect TMDB rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone! ${saved} celebrities cached, ${withBirthday} with birthday data.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
