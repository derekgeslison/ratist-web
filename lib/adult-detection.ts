/**
 * Adult-content auto-detection via TMDB keyword tags.
 *
 * TMDB's `adult` boolean is reserved for commercial porn-industry
 * releases and misses softcore / erotic films that ship through more
 * legitimate distribution. Those still slip onto popular discovery
 * rails — examples seen in the wild: 1087040, 258216, 1075175, 440249.
 *
 * Approach: each Movie row carries `adultKeywordsCheckedAt`. When the
 * popular-rail safeguard sees a row with `null` (or no row at all), it
 * fetches `/movie/{id}/keywords`, matches against the substring list
 * below, sets `isAdult: true` on a hit, and stamps the timestamp
 * regardless of verdict so the next render skips the round-trip.
 *
 * The list is intentionally substring-based (case-insensitive) so
 * variants like "softcore", "soft-core", "softcore porn", and
 * "softcore pornography" all match the single "softcore" entry. Be
 * conservative when adding entries — anything overly broad (e.g.
 * "sex") would over-flag mainstream films. Tested terms are listed
 * below with the trade-off considered.
 */

import { prisma } from "@/lib/prisma";

/**
 * Substring patterns matched against TMDB keyword names
 * (case-insensitive). A movie is flagged adult if ANY of its keyword
 * names contains ANY of these patterns.
 */
const ADULT_KEYWORD_PATTERNS: string[] = [
  // Erotica / erotic film / erotic thriller / erotic drama …
  "erotic",
  // Softcore / soft-core / softcore pornography / softcore porn …
  "softcore",
  "soft core",
  "soft-core",
  // Hardcore porn / hardcore pornography (not "hardcore music" — keyword names
  // for music don't contain "porn" or "hardcore pornograph", so we'd miss
  // those false positives by requiring the porn/pornograph stem).
  "pornograph",
  "porn industry",
  "porn star",
  "porn film",
  "porno film",
  // Adult-film-industry, adult-film, adult film star
  "adult film",
  "adult movie",
  "adult video",
  // Pinku eiga = Japanese softcore subgenre
  "pinku eiga",
  // Sexploitation films
  "sexploitation",
  // Hentai
  "hentai",
];

const TMDB_BASE = "https://api.themoviedb.org/3";

export function keywordsMatchAdult(keywords: { name: string }[]): boolean {
  for (const k of keywords) {
    const lower = (k.name ?? "").toLowerCase();
    for (const p of ADULT_KEYWORD_PATTERNS) {
      if (lower.includes(p)) return true;
    }
  }
  return false;
}

/**
 * Fetches `/movie/{id}/keywords` and writes back the adult verdict.
 * Idempotent — repeated calls for the same id with a fresh check
 * timestamp are no-ops apart from the cost of the network call.
 *
 * Returns true if the verdict is "adult" (so callers can drop the
 * item from the current render synchronously). Returns false on
 * clean verdicts AND on any failure path — failures should never
 * unblock content; they should leave the item visible and the
 * caller retry next render.
 */
export async function fetchAndFlagAdultKeywords(tmdbId: number): Promise<boolean> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return false;
  let keywords: { id: number; name: string }[] = [];
  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}/keywords?api_key=${apiKey}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return false;
    const data = await res.json() as { keywords?: { id: number; name: string }[] };
    keywords = data.keywords ?? [];
  } catch {
    return false;
  }
  const isAdult = keywordsMatchAdult(keywords);
  // Upsert: we may be seeing this tmdbId for the first time (no Movie
  // row yet) — create a stub so the verdict sticks. Title is "" as a
  // placeholder; the row will be re-upserted with proper fields when
  // the movie's detail page is visited.
  try {
    await prisma.movie.upsert({
      where: { tmdbId },
      create: {
        tmdbId,
        title: "",
        isAdult,
        adultKeywordsCheckedAt: new Date(),
      },
      update: {
        ...(isAdult ? { isAdult: true } : {}),
        adultKeywordsCheckedAt: new Date(),
      },
    });
  } catch {
    // Swallow — race or transient DB hiccup shouldn't bubble into
    // page render. We'll just retry on the next safeguard pass.
  }
  return isAdult;
}

const SCAN_CONCURRENCY = 10;

/**
 * Run adult-keyword checks on a list of TMDB ids concurrently. Returns
 * the subset of ids that turned out to be adult so the caller can
 * filter the rendering list inline. Used by the popular-rail
 * safeguard for unknown / unchecked movies.
 */
export async function batchAdultKeywordCheck(tmdbIds: number[]): Promise<Set<number>> {
  if (tmdbIds.length === 0) return new Set();
  const adultIds = new Set<number>();
  let cursor = 0;
  async function worker() {
    while (cursor < tmdbIds.length) {
      const idx = cursor++;
      const id = tmdbIds[idx];
      try {
        const isAdult = await fetchAndFlagAdultKeywords(id);
        if (isAdult) adultIds.add(id);
      } catch {
        // Per fetchAndFlagAdultKeywords contract: failures leave the
        // item visible. We just don't add to adultIds.
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(SCAN_CONCURRENCY, tmdbIds.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return adultIds;
}
