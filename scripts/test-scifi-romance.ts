// Replicate the recommend route's tmdbGetGenreAware logic for sci-fi+romance
// to see what the user is actually getting.
const TMDB_BASE = "https://api.themoviedb.org/3";
const API_KEY: string = process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? (() => {
  console.error("Set TMDB_API_KEY or NEXT_PUBLIC_TMDB_API_KEY before running.");
  process.exit(1);
})();

async function tmdbGet(path: string, params: Record<string, string>) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const genreIds = ["878", "10749"]; // Science Fiction, Romance
  const baseParams = {
    page: "1",
    sort_by: "popularity.desc",
    "vote_count.gte": "10",
  };

  const andParams = { ...baseParams, with_genres: "878,10749" };
  const orParams = { ...baseParams, with_genres: "878|10749" };

  const [andRes, orRes] = await Promise.all([
    tmdbGet("/discover/movie", andParams),
    tmdbGet("/discover/movie", orParams),
  ]);

  console.log(`AND (with_genres=878,10749): ${andRes?.results?.length ?? 0} on page 1, ${andRes?.total_results ?? 0} total`);
  console.log("  First 5 AND titles:");
  for (const m of (andRes?.results ?? []).slice(0, 5)) {
    console.log(`    ${m.title} (${m.release_date?.slice(0,4)})  genre_ids=[${m.genre_ids}]`);
  }

  console.log(`\nOR (with_genres=878|10749): ${orRes?.results?.length ?? 0} on page 1, ${orRes?.total_results ?? 0} total`);
  console.log("  First 5 OR titles:");
  for (const m of (orRes?.results ?? []).slice(0, 5)) {
    console.log(`    ${m.title} (${m.release_date?.slice(0,4)})  genre_ids=[${m.genre_ids}]`);
  }

  // Merge AND-first
  const andIds = new Set((andRes?.results ?? []).map((r: any) => r.id));
  const orUnique = (orRes?.results ?? []).filter((r: any) => !andIds.has(r.id));
  const merged = [...(andRes?.results ?? []), ...orUnique];

  console.log(`\nMerged (AND-first + OR-unique): ${merged.length} total`);
  console.log("  First 10 merged titles (what user would see):");
  for (let i = 0; i < Math.min(10, merged.length); i++) {
    const m = merged[i];
    const isSciRom = m.genre_ids?.includes(878) && m.genre_ids?.includes(10749);
    console.log(`    ${i + 1}. ${m.title} (${m.release_date?.slice(0,4)})  ${isSciRom ? "✓ sci-fi+romance" : "(only one)"}`);
  }
}

main();
