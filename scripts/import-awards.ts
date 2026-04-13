/**
 * Bulk import awards data from Wikidata.
 *
 * Strategy:
 *   1. Seed AwardBody table with known award organizations
 *   2. Query Wikidata for Oscar-nominated movies since 2000 (year by year)
 *   3. Query Wikidata for Oscar-winning movies before 2000 (Best Picture winners)
 *   4. For each movie: ensure it exists in DB, then sync its awards
 *   5. Gather unique celebrities from imported awards, sync their awards too
 *
 * Run with: npx tsx scripts/import-awards.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const TMDB_BASE = "https://api.themoviedb.org/3";

// ─── Rate-limited fetchers ─────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const url = `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

interface TMDBMovieBasic {
  id: number;
  title: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime?: number;
  popularity: number;
  vote_average: number;
  vote_count: number;
  imdb_id?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  status?: string;
  genres?: { id: number; name: string }[];
  videos?: { results: { key: string; site: string; type: string }[] };
  credits?: {
    cast: { id: number; name: string; profile_path: string | null; known_for_department: string | null; character: string; order: number; popularity: number }[];
    crew: { id: number; name: string; profile_path: string | null; known_for_department: string | null; job: string; department: string; popularity: number }[];
  };
  release_dates?: { results: { iso_3166_1: string; certification: string; release_dates?: { certification: string }[] }[] };
}

// ─── Wikidata SPARQL (inlined to avoid path alias issues in scripts) ───────

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Ratist/1.0 (https://theratist.com)";

let lastSparqlTime = 0;

async function sparqlFetch(query: string): Promise<{ [key: string]: { value: string } | undefined }[]> {
  const now = Date.now();
  if (now - lastSparqlTime < 1100) {
    await sleep(1100 - (now - lastSparqlTime));
  }
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

// ─── Award body & category helpers ─────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function identifyAwardBody(label: string): { slug: string; name: string; shortName: string } {
  const l = label.toLowerCase();
  if (l.includes("academy award") || l.includes("oscar")) return { slug: "oscar", name: "Academy Awards", shortName: "Oscar" };
  if (l.includes("golden globe")) return { slug: "golden-globe", name: "Golden Globe Awards", shortName: "Golden Globe" };
  if (l.includes("bafta") || l.includes("british academy")) return { slug: "bafta", name: "BAFTA Awards", shortName: "BAFTA" };
  if (l.includes("screen actors guild") || l.includes("sag award")) return { slug: "sag", name: "Screen Actors Guild Awards", shortName: "SAG" };
  if (l.includes("palme") || l.includes("cannes") || l.includes("prix")) return { slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes" };
  if (l.includes("emmy") || l.includes("primetime")) return { slug: "emmy", name: "Primetime Emmy Awards", shortName: "Emmy" };
  if (l.includes("critics' choice") || l.includes("critics choice")) return { slug: "critics-choice", name: "Critics' Choice Awards", shortName: "Critics' Choice" };
  if (l.includes("venice") || l.includes("golden lion")) return { slug: "venice", name: "Venice Film Festival", shortName: "Venice" };
  if (l.includes("berlin") || l.includes("golden bear")) return { slug: "berlin", name: "Berlin International Film Festival", shortName: "Berlin" };
  if (l.includes("independent spirit")) return { slug: "indie-spirit", name: "Independent Spirit Awards", shortName: "Indie Spirit" };
  if (l.includes("directors guild") || l.includes("dga award")) return { slug: "dga", name: "Directors Guild of America Awards", shortName: "DGA" };
  if (l.includes("writers guild") || l.includes("wga award")) return { slug: "wga", name: "Writers Guild of America Awards", shortName: "WGA" };
  if (l.includes("producers guild") || l.includes("pga award")) return { slug: "pga", name: "Producers Guild of America Awards", shortName: "PGA" };
  if (l.includes("peabody")) return { slug: "peabody", name: "Peabody Awards", shortName: "Peabody" };
  if (l.includes("saturn award")) return { slug: "saturn", name: "Saturn Awards", shortName: "Saturn" };
  if (l.includes("tca award") || l.includes("television critics association")) return { slug: "tca", name: "Television Critics Association Awards", shortName: "TCA" };
  if (l.includes("satellite award")) return { slug: "satellite", name: "Satellite Awards", shortName: "Satellite" };
  if (l.includes("annie award")) return { slug: "annie", name: "Annie Awards", shortName: "Annie" };
  if (l.includes("gotham")) return { slug: "gotham", name: "Gotham Awards", shortName: "Gotham" };
  if (l.includes("afi award") || l.includes("american film institute")) return { slug: "afi", name: "AFI Awards", shortName: "AFI" };
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

// ─── Movie upsert (simplified for script) ──────────────────────────────────

async function ensureMovie(tmdbId: number, imdbId?: string | null): Promise<string> {
  const existing = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Fetch from TMDB
  await sleep(300);
  const movie = await tmdbFetch<TMDBMovieBasic>(
    `/movie/${tmdbId}?append_to_response=videos,credits,release_dates`
  );

  let mpaaRating: string | null = null;
  const usRelease = movie.release_dates?.results?.find((c) => c.iso_3166_1 === "US");
  if (usRelease?.certification) mpaaRating = usRelease.certification;

  let trailerKey: string | null = null;
  const trailer = movie.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer");
  if (trailer) trailerKey = trailer.key;

  const result = await prisma.movie.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      imdbId: movie.imdb_id ?? imdbId ?? null,
      title: movie.title,
      overview: movie.overview ?? null,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      releaseDate: movie.release_date ?? null,
      runtime: movie.runtime ?? null,
      mpaaRating,
      tagline: movie.tagline ?? null,
      budget: movie.budget ? BigInt(movie.budget) : null,
      revenue: movie.revenue ? BigInt(movie.revenue) : null,
      popularity: movie.popularity ?? null,
      voteAverage: movie.vote_average ?? null,
      voteCount: movie.vote_count ?? null,
      trailerKey,
      status: movie.status ?? null,
      cachedAt: new Date(),
    },
    update: { imdbId: movie.imdb_id ?? imdbId ?? undefined },
    select: { id: true },
  });

  return result.id;
}

// ─── Fetch & sync awards for a single movie ────────────────────────────────

async function fetchAndSyncMovieAwards(movieId: string, tmdbId: number, imdbId?: string | null): Promise<number> {
  const entityFilter = imdbId
    ? `{ ?entity wdt:P4947 "${tmdbId}" } UNION { ?entity wdt:P345 "${imdbId}" }`
    : `?entity wdt:P4947 "${tmdbId}"`;

  // Split into two queries to avoid Wikidata UNION timeouts
  const winsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ${entityFilter}
      ?entity p:P166 ?stmt .
      ?stmt ps:P166 ?awardUri .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?stmt pq:P805 ?ceremony . ?ceremony rdfs:label ?ceremonyLabel . FILTER(LANG(?ceremonyLabel) = "en") }
      ?awardUri rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en")
    } LIMIT 200
  `;
  const nomsQuery = `
    SELECT ?awardUri ?awardLabel ?year ?ceremonyLabel WHERE {
      ${entityFilter}
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
      const dedupKey = [categoryId, year ?? 0, movieId, "", "", "", ""].join("|");

      await prisma.awardNomination.upsert({
        where: { dedupKey },
        create: { dedupKey, categoryId, isWinner, year, ceremony, movieId, wikidataId },
        update: { isWinner, ceremony },
      });
      count++;
    } catch {
      // Skip dedup conflicts
    }
  }

  // Only mark synced if we actually got results
  if (count > 0) {
    await prisma.awardsSyncLog.upsert({
      where: { entityType_entityId: { entityType: "movie", entityId: movieId } },
      create: { entityType: "movie", entityId: movieId },
      update: { syncedAt: new Date() },
    });
  }

  return count;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Awards Import Script ===\n");

  // Step 1: Seed award bodies
  console.log("Step 1: Seeding award bodies...");
  const bodies = [
    { slug: "oscar", name: "Academy Awards", shortName: "Oscar", wikidataId: "Q19020" },
    { slug: "golden-globe", name: "Golden Globe Awards", shortName: "Golden Globe", wikidataId: "Q1011547" },
    { slug: "bafta", name: "BAFTA Awards", shortName: "BAFTA", wikidataId: "Q185667" },
    { slug: "sag", name: "Screen Actors Guild Awards", shortName: "SAG", wikidataId: "Q663732" },
    { slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes", wikidataId: "Q103360" },
    { slug: "emmy", name: "Primetime Emmy Awards", shortName: "Emmy", wikidataId: "Q123737" },
    { slug: "critics-choice", name: "Critics' Choice Awards", shortName: "Critics' Choice", wikidataId: "Q862764" },
    { slug: "venice", name: "Venice Film Festival", shortName: "Venice", wikidataId: "Q846301" },
    { slug: "berlin", name: "Berlin International Film Festival", shortName: "Berlin", wikidataId: "Q49024" },
    { slug: "indie-spirit", name: "Independent Spirit Awards", shortName: "Indie Spirit", wikidataId: "Q631041" },
  ];
  for (const b of bodies) {
    await prisma.awardBody.upsert({
      where: { slug: b.slug },
      create: b,
      update: { wikidataId: b.wikidataId },
    });
  }
  console.log(`  Seeded ${bodies.length} award bodies.\n`);

  // Step 2: Oscar nominees since 2000
  console.log("Step 2: Fetching Oscar-nominated movies (2000-2026)...");
  const allMovies = new Map<number, { tmdbId: number; imdbId: string | null; title: string }>();

  for (let year = 2000; year <= 2026; year++) {
    console.log(`  Querying year ${year}...`);
    try {
      const query = `
        SELECT DISTINCT ?movieLabel ?tmdbId ?imdbId WHERE {
          ?movie wdt:P31 wd:Q11424 .
          {
            ?movie p:P166 ?stmt . ?stmt ps:P166 ?award .
            ?award rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en" && CONTAINS(?awardLabel, "Academy Award"))
            OPTIONAL { ?stmt pq:P585 ?date }
          } UNION {
            ?movie p:P1411 ?stmt . ?stmt ps:P1411 ?award .
            ?award rdfs:label ?awardLabel . FILTER(LANG(?awardLabel) = "en" && CONTAINS(?awardLabel, "Academy Award"))
            OPTIONAL { ?stmt pq:P585 ?date }
          }
          FILTER(YEAR(?date) = ${year})
          ?movie wdt:P4947 ?tmdbId .
          OPTIONAL { ?movie wdt:P345 ?imdbId }
          ?movie rdfs:label ?movieLabel . FILTER(LANG(?movieLabel) = "en")
        }
        LIMIT 200
      `;
      const bindings = await sparqlFetch(query);
      for (const b of bindings) {
        const tmdbId = parseInt(b.tmdbId?.value ?? "0");
        if (tmdbId > 0) {
          allMovies.set(tmdbId, {
            tmdbId,
            imdbId: b.imdbId?.value ?? null,
            title: b.movieLabel?.value ?? "Unknown",
          });
        }
      }
      console.log(`    Found ${bindings.length} movies, total unique: ${allMovies.size}`);
    } catch (e) {
      console.error(`    Error fetching year ${year}:`, e);
    }
  }

  // Step 3: Oscar winners before 2000 (Best Picture only, to keep it manageable)
  console.log("\nStep 3: Fetching pre-2000 Oscar Best Picture winners...");
  try {
    const query = `
      SELECT DISTINCT ?movieLabel ?tmdbId ?imdbId WHERE {
        ?movie wdt:P31 wd:Q11424 .
        ?movie p:P166 ?stmt .
        ?stmt ps:P166 wd:Q102427 .  # Academy Award for Best Picture
        ?movie wdt:P4947 ?tmdbId .
        OPTIONAL { ?movie wdt:P345 ?imdbId }
        ?movie rdfs:label ?movieLabel . FILTER(LANG(?movieLabel) = "en")
        OPTIONAL { ?stmt pq:P585 ?date }
        FILTER(!BOUND(?date) || YEAR(?date) < 2000)
      }
      LIMIT 200
    `;
    const bindings = await sparqlFetch(query);
    for (const b of bindings) {
      const tmdbId = parseInt(b.tmdbId?.value ?? "0");
      if (tmdbId > 0) {
        allMovies.set(tmdbId, {
          tmdbId,
          imdbId: b.imdbId?.value ?? null,
          title: b.movieLabel?.value ?? "Unknown",
        });
      }
    }
    console.log(`  Found ${bindings.length} pre-2000 winners, total unique: ${allMovies.size}`);
  } catch (e) {
    console.error("  Error fetching pre-2000 winners:", e);
  }

  // Step 4: Ensure movies exist in DB and sync their awards
  console.log(`\nStep 4: Importing awards for ${allMovies.size} movies...`);
  let movieCount = 0;
  let totalAwards = 0;

  for (const [tmdbId, movie] of allMovies) {
    movieCount++;
    if (movieCount % 10 === 0) {
      console.log(`  Progress: ${movieCount}/${allMovies.size} movies (${totalAwards} awards so far)`);
    }

    try {
      const movieId = await ensureMovie(tmdbId, movie.imdbId);
      const awards = await fetchAndSyncMovieAwards(movieId, tmdbId, movie.imdbId);
      totalAwards += awards;
    } catch (e) {
      console.error(`  Error processing "${movie.title}" (tmdb:${tmdbId}):`, e);
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Movies processed: ${movieCount}`);
  console.log(`Total awards imported: ${totalAwards}`);

  // Summary
  const bodyStats = await prisma.awardBody.findMany({
    select: { shortName: true, _count: { select: { categories: true } } },
  });
  const totalNoms = await prisma.awardNomination.count();
  const totalWins = await prisma.awardNomination.count({ where: { isWinner: true } });
  console.log(`\nDatabase totals:`);
  console.log(`  Award bodies: ${bodyStats.length}`);
  console.log(`  Total nominations: ${totalNoms}`);
  console.log(`  Total wins: ${totalWins}`);
  for (const b of bodyStats) {
    console.log(`  ${b.shortName}: ${b._count.categories} categories`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
