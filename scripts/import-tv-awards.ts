/**
 * Bulk import TV show awards data from Wikidata.
 *
 * Strategy:
 *   1. Query all Emmy-winning + Emmy-nominated TV shows (all years, ~300 total)
 *   2. Resolve IMDb IDs to TMDB IDs via TMDB /find endpoint
 *   3. Ensure each show exists in our DB
 *   4. Sync awards for each show (split wins/noms queries)
 *
 * Run with: npx tsx scripts/import-tv-awards.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const TMDB_BASE = "https://api.themoviedb.org/3";

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Ratist/1.0 (https://theratist.com)";
let lastSparqlTime = 0;

async function sparqlFetch(query: string): Promise<{ [key: string]: { value: string } | undefined }[]> {
  const now = Date.now();
  if (now - lastSparqlTime < 1100) await sleep(1100 - (now - lastSparqlTime));
  lastSparqlTime = Date.now();

  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
    body: `query=${encodeURIComponent(query)}`,
  });

  if (res.status === 429) {
    console.log("  Rate limited by Wikidata, waiting 10s...");
    await sleep(10000);
    return sparqlFetch(query);
  }
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.results.bindings;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function identifyAwardBody(label: string): { slug: string; name: string; shortName: string } {
  const l = label.toLowerCase();
  if (l.includes("academy award") || l.includes("oscar")) return { slug: "oscar", name: "Academy Awards", shortName: "Oscar" };
  if (l.includes("golden globe")) return { slug: "golden-globe", name: "Golden Globe Awards", shortName: "Golden Globe" };
  if (l.includes("bafta") || l.includes("british academy")) return { slug: "bafta", name: "BAFTA Awards", shortName: "BAFTA" };
  if (l.includes("screen actors guild") || l.includes("sag award")) return { slug: "sag", name: "Screen Actors Guild Awards", shortName: "SAG" };
  if (l.includes("emmy") || l.includes("primetime")) return { slug: "emmy", name: "Primetime Emmy Awards", shortName: "Emmy" };
  if (l.includes("critics' choice") || l.includes("critics choice")) return { slug: "critics-choice", name: "Critics' Choice Awards", shortName: "Critics' Choice" };
  if (l.includes("directors guild") || l.includes("dga award")) return { slug: "dga", name: "Directors Guild of America Awards", shortName: "DGA" };
  if (l.includes("writers guild") || l.includes("wga award")) return { slug: "wga", name: "Writers Guild of America Awards", shortName: "WGA" };
  if (l.includes("producers guild") || l.includes("pga award")) return { slug: "pga", name: "Producers Guild of America Awards", shortName: "PGA" };
  if (l.includes("peabody")) return { slug: "peabody", name: "Peabody Awards", shortName: "Peabody" };
  if (l.includes("saturn award")) return { slug: "saturn", name: "Saturn Awards", shortName: "Saturn" };
  if (l.includes("tca award") || l.includes("television critics association")) return { slug: "tca", name: "Television Critics Association Awards", shortName: "TCA" };
  if (l.includes("satellite award")) return { slug: "satellite", name: "Satellite Awards", shortName: "Satellite" };
  if (l.includes("gotham")) return { slug: "gotham", name: "Gotham Awards", shortName: "Gotham" };
  return { slug: "other", name: "Other Awards", shortName: "Other" };
}

async function ensureCategory(bodySlug: string, bodyName: string, bodyShortName: string, categoryLabel: string, wikidataId: string | null): Promise<string> {
  const body = await prisma.awardBody.upsert({
    where: { slug: bodySlug },
    create: { slug: bodySlug, name: bodyName, shortName: bodyShortName },
    update: {},
    select: { id: true },
  });
  const catSlug = slugify(categoryLabel);
  const category = await prisma.awardCategory.upsert({
    where: { awardBodyId_slug: { awardBodyId: body.id, slug: catSlug } },
    create: { awardBodyId: body.id, slug: catSlug, name: categoryLabel, wikidataId },
    update: {},
    select: { id: true },
  });
  return category.id;
}

// ─── Resolve IMDb ID to TMDB show ID ───────────────────────────────────────

async function imdbToTmdbShow(imdbId: string): Promise<number | null> {
  await sleep(300);
  try {
    const res = await fetch(`${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
    if (!res.ok) return null;
    const data = await res.json();
    const tvResults = data.tv_results ?? [];
    if (tvResults.length > 0) return tvResults[0].id;
    return null;
  } catch {
    return null;
  }
}

// ─── Ensure TV show in DB ──────────────────────────────────────────────────

async function ensureShow(tmdbId: number, imdbId: string): Promise<string> {
  const existing = await prisma.tVShow.findUnique({
    where: { tmdbId },
    select: { id: true },
  });
  if (existing) {
    // Update imdbId if missing
    await prisma.tVShow.update({ where: { tmdbId }, data: { imdbId } }).catch(() => {});
    return existing.id;
  }

  await sleep(300);
  const res = await fetch(
    `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=content_ratings,videos`
  );
  if (!res.ok) throw new Error(`TMDB ${res.status} for show ${tmdbId}`);
  const show = await res.json();

  let contentRating: string | null = null;
  const usRating = show.content_ratings?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
  if (usRating?.rating) contentRating = usRating.rating;

  let trailerKey: string | null = null;
  const trailer = show.videos?.results?.find((v: { site: string; type: string }) => v.site === "YouTube" && v.type === "Trailer");
  if (trailer) trailerKey = trailer.key;

  const result = await prisma.tVShow.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      imdbId,
      name: show.name,
      overview: show.overview ?? null,
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path,
      firstAirDate: show.first_air_date ?? null,
      lastAirDate: show.last_air_date ?? null,
      status: show.status ?? null,
      numberOfSeasons: show.number_of_seasons ?? null,
      numberOfEpisodes: show.number_of_episodes ?? null,
      contentRating,
      tagline: show.tagline ?? null,
      popularity: show.popularity ?? null,
      voteAverage: show.vote_average ?? null,
      voteCount: show.vote_count ?? null,
      trailerKey,
      cachedAt: new Date(),
    },
    update: { imdbId },
    select: { id: true },
  });

  return result.id;
}

// ─── Fetch & sync awards for a single show ─────────────────────────────────

async function fetchAndSyncShowAwards(showId: string, imdbId: string): Promise<number> {
  const winsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ?entity wdt:P345 "${imdbId}" .
      ?entity p:P166 ?stmt .
      ?stmt ps:P166 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;
  const nomsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ?entity wdt:P345 "${imdbId}" .
      ?entity p:P1411 ?stmt .
      ?stmt ps:P1411 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;

  const [wins, noms] = await Promise.all([
    sparqlFetch(winsQuery).catch(() => []),
    sparqlFetch(nomsQuery).catch(() => []),
  ]);

  type Binding = { [key: string]: { value: string } | undefined };
  const allBindings: { b: Binding; isWinner: boolean }[] = [
    ...wins.map((b: Binding) => ({ b, isWinner: true })),
    ...noms.map((b: Binding) => ({ b, isWinner: false })),
  ];

  let count = 0;
  for (const { b, isWinner } of allBindings) {
    const categoryLabel = b.awardLabel?.value ?? "Unknown";
    const wikidataId = b.awardUri?.value?.match(/Q\d+$/)?.[0] ?? null;
    const body = identifyAwardBody(categoryLabel);

    const year = b.year?.value ? parseInt(b.year.value) : null;
    const ceremony = b.ceremonyLabel?.value ?? null;

    try {
      const categoryId = await ensureCategory(body.slug, body.name, body.shortName, categoryLabel, wikidataId);
      const dedupKey = [categoryId, year ?? 0, "", showId, "", "", ""].join("|");

      await prisma.awardNomination.upsert({
        where: { dedupKey },
        create: { dedupKey, categoryId, isWinner, year, ceremony, tvShowId: showId, wikidataId },
        update: { ...(isWinner ? { isWinner: true } : {}), ...(ceremony ? { ceremony } : {}) },
      });
      count++;
    } catch {
      // Skip dedup conflicts
    }
  }

  if (count > 0) {
    await prisma.awardsSyncLog.upsert({
      where: { entityType_entityId: { entityType: "tvshow", entityId: showId } },
      create: { entityType: "tvshow", entityId: showId },
      update: { syncedAt: new Date() },
    });
  }

  return count;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== TV Show Awards Import Script ===\n");

  // Step 1: Discover all Emmy-related TV shows from Wikidata
  console.log("Step 1: Fetching Emmy-winning TV shows...");
  const allShows = new Map<string, { imdbId: string; title: string }>();

  try {
    const winsBindings = await sparqlFetch(`
      SELECT DISTINCT ?showLabel ?imdbId WHERE {
        ?show p:P166 ?stmt . ?stmt ps:P166 ?award .
        ?award rdfs:label ?al . FILTER(LANG(?al) = "en" && CONTAINS(?al, "Emmy"))
        ?show wdt:P345 ?imdbId .
        FILTER(STRSTARTS(?imdbId, "tt"))
        ?show rdfs:label ?showLabel . FILTER(LANG(?showLabel) = "en")
      } LIMIT 500
    `);
    for (const b of winsBindings) {
      const imdbId = b.imdbId?.value;
      if (imdbId) allShows.set(imdbId, { imdbId, title: b.showLabel?.value ?? "Unknown" });
    }
    console.log(`  Found ${winsBindings.length} Emmy-winning shows.`);
  } catch (e) {
    console.error("  Error fetching winners:", e);
  }

  console.log("  Fetching Emmy-nominated TV shows...");
  try {
    const nomsBindings = await sparqlFetch(`
      SELECT DISTINCT ?showLabel ?imdbId WHERE {
        ?show p:P1411 ?stmt . ?stmt ps:P1411 ?award .
        ?award rdfs:label ?al . FILTER(LANG(?al) = "en" && CONTAINS(?al, "Emmy"))
        ?show wdt:P345 ?imdbId .
        FILTER(STRSTARTS(?imdbId, "tt"))
        ?show rdfs:label ?showLabel . FILTER(LANG(?showLabel) = "en")
      } LIMIT 500
    `);
    for (const b of nomsBindings) {
      const imdbId = b.imdbId?.value;
      if (imdbId && !allShows.has(imdbId)) {
        allShows.set(imdbId, { imdbId, title: b.showLabel?.value ?? "Unknown" });
      }
    }
    console.log(`  Found ${nomsBindings.length} additional Emmy-nominated shows.`);
  } catch (e) {
    console.error("  Error fetching nominees:", e);
  }

  console.log(`  Total unique shows: ${allShows.size}\n`);

  // Step 2: Resolve IMDb IDs to TMDB IDs and ensure shows exist
  console.log("Step 2: Resolving IMDb IDs to TMDB and importing shows...");
  const resolvedShows: { showId: string; imdbId: string; tmdbId: number; title: string }[] = [];
  let resolveCount = 0;
  let failedResolve = 0;

  for (const [imdbId, show] of allShows) {
    resolveCount++;
    if (resolveCount % 20 === 0) {
      console.log(`  Progress: ${resolveCount}/${allShows.size} resolved (${resolvedShows.length} found, ${failedResolve} failed)`);
    }

    // Check if already in DB by imdbId
    const existing = await prisma.tVShow.findUnique({
      where: { imdbId },
      select: { id: true, tmdbId: true },
    });
    if (existing) {
      resolvedShows.push({ showId: existing.id, imdbId, tmdbId: existing.tmdbId, title: show.title });
      continue;
    }

    // Resolve via TMDB
    const tmdbId = await imdbToTmdbShow(imdbId);
    if (!tmdbId) {
      failedResolve++;
      continue;
    }

    try {
      const showId = await ensureShow(tmdbId, imdbId);
      resolvedShows.push({ showId, imdbId, tmdbId, title: show.title });
    } catch (e) {
      console.error(`  Failed to import "${show.title}" (${imdbId}):`, e);
      failedResolve++;
    }
  }

  console.log(`  Resolved ${resolvedShows.length} shows, ${failedResolve} failed.\n`);

  // Step 3: Sync awards for each show
  console.log(`Step 3: Importing awards for ${resolvedShows.length} shows...`);
  let showCount = 0;
  let totalAwards = 0;

  for (const show of resolvedShows) {
    showCount++;
    if (showCount % 10 === 0) {
      console.log(`  Progress: ${showCount}/${resolvedShows.length} shows (${totalAwards} awards so far)`);
    }

    try {
      const awards = await fetchAndSyncShowAwards(show.showId, show.imdbId);
      totalAwards += awards;
    } catch (e) {
      console.error(`  Error processing "${show.title}" (${show.imdbId}):`, e);
    }
  }

  // Summary
  console.log(`\n=== TV Import Complete ===`);
  console.log(`Shows processed: ${showCount}`);
  console.log(`Total awards imported: ${totalAwards}`);

  const totalNoms = await prisma.awardNomination.count({ where: { tvShowId: { not: null } } });
  const totalWins = await prisma.awardNomination.count({ where: { tvShowId: { not: null }, isWinner: true } });
  console.log(`\nTV show awards in DB:`);
  console.log(`  Total nominations: ${totalNoms}`);
  console.log(`  Total wins: ${totalWins}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
