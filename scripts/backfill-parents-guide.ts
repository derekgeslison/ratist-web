// One-shot backfill for MovieParentsGuide cache. Pulls top-N popular movies
// from TMDB and hits the local /api/movies/[id]/parents-guide endpoint for
// each, which does the DDD lookup and write-through DB upsert.
//
// Usage: npx tsx scripts/backfill-parents-guide.ts [pages]
//   pages defaults to 25 (≈500 movies) — 50 pages ≈ 1000.
//
// Requires: dev server running at localhost:3000 (or set BASE_URL env var)
//           DDD_API_KEY configured in .env.local (already read by the route)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

// Throttle: DDD tolerance unknown. Be conservative — ~2 req/sec max.
const DELAY_MS = 500;

async function main() {
  const pagesArg = Number(process.argv[2]);
  const pages = Number.isFinite(pagesArg) && pagesArg > 0 ? Math.min(pagesArg, 500) : 25;
  console.log(`Backfill target: ${pages} TMDB pages × 20 movies = ${pages * 20} titles`);
  console.log(`Endpoint: ${BASE_URL}/api/movies/<id>/parents-guide`);
  console.log();

  if (!TMDB_API_KEY) {
    console.error("TMDB_API_KEY missing — can't list popular movies");
    process.exit(1);
  }

  const { prisma } = await import("../lib/prisma");
  const before = await prisma.movieParentsGuide.count();
  console.log(`MovieParentsGuide cache before: ${before} entries`);
  console.log();

  // 1. Collect popular-movie IDs + titles from TMDB.
  const titlesById = new Map<number, string>();
  for (let page = 1; page <= pages; page++) {
    const url = `${TMDB_BASE}/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[page ${page}] TMDB error ${res.status}`);
      continue;
    }
    const data = await res.json() as { results?: { id: number; title: string }[] };
    for (const m of data.results ?? []) titlesById.set(m.id, m.title);
    await sleep(100); // don't hammer TMDB between list pages
  }
  console.log(`Collected ${titlesById.size} unique movie IDs from TMDB`);
  console.log();

  // 2. Skip IDs already cached (backfill is idempotent but why re-hit DDD).
  const cached = await prisma.movieParentsGuide.findMany({ select: { tmdbId: true } });
  const cachedSet = new Set(cached.map((c) => c.tmdbId));
  const todo = [...titlesById.entries()].filter(([id]) => !cachedSet.has(id));
  console.log(`Skipping ${titlesById.size - todo.length} already-cached titles; ${todo.length} remaining`);
  console.log();

  // 3. Hit the local endpoint for each, pace requests.
  let success = 0;
  let empty = 0;
  let errors = 0;
  const start = Date.now();

  for (let i = 0; i < todo.length; i++) {
    const [id, title] = todo[i];
    const url = `${BASE_URL}/api/movies/${id}/parents-guide?title=${encodeURIComponent(title)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors++;
        if (errors <= 5) console.log(`  [${id}] "${title}" → HTTP ${res.status}`);
      } else {
        const data = await res.json();
        if (data.categories == null) {
          empty++;
        } else {
          success++;
        }
      }
    } catch (err) {
      errors++;
      if (errors <= 5) console.log(`  [${id}] "${title}" → ${(err as Error).message}`);
    }

    // Progress line every 25 titles.
    if ((i + 1) % 25 === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      const rate = (i + 1) / elapsed;
      const etaSec = Math.round((todo.length - i - 1) / rate);
      console.log(`  ${i + 1}/${todo.length}  (✓${success} ∅${empty} ✗${errors})  ${rate.toFixed(1)}/s  ETA ${etaSec}s`);
    }
    await sleep(DELAY_MS);
  }

  const after = await prisma.movieParentsGuide.count();
  console.log();
  console.log("=".repeat(60));
  console.log(`Done. Processed: ${todo.length}`);
  console.log(`  ✓ cached with data: ${success}`);
  console.log(`  ∅ no DDD data: ${empty}`);
  console.log(`  ✗ errors: ${errors}`);
  console.log(`MovieParentsGuide cache after: ${after} entries (was ${before}, added ${after - before})`);
  console.log(`Elapsed: ${Math.round((Date.now() - start) / 1000)}s`);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
    process.exit(0);
  });
