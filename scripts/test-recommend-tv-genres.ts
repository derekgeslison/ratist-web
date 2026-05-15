// Probe the recommend route's TV genre translation by calling the same
// helpers it uses. Confirms whether the issue is in the translation layer
// or upstream at the request layer.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const KEY = process.env.TMDB_API_KEY;
  if (!KEY) { console.log("No TMDB_API_KEY"); return; }

  const { getGenres } = await import("../lib/tmdb");
  const data = await getGenres();
  const nameToId = new Map(data.genres.map((g) => [g.name, g.id]));
  console.log("Action →", nameToId.get("Action"));
  console.log("Adventure →", nameToId.get("Adventure"));
  console.log("Science Fiction →", nameToId.get("Science Fiction"));

  // Direct TMDB hits
  const probes = [
    { label: "TV / Action & Adventure (10759)", url: `https://api.themoviedb.org/3/discover/tv?api_key=${KEY}&with_genres=10759&sort_by=popularity.desc&page=1` },
    { label: "TV / Action movie-ID 28 (WRONG, should return 0/404-style)", url: `https://api.themoviedb.org/3/discover/tv?api_key=${KEY}&with_genres=28&sort_by=popularity.desc&page=1` },
    { label: "TV / Sci-Fi & Fantasy (10765)", url: `https://api.themoviedb.org/3/discover/tv?api_key=${KEY}&with_genres=10765&sort_by=popularity.desc&page=1` },
  ];
  for (const p of probes) {
    const res = await fetch(p.url);
    const d = await res.json() as { results?: { name: string }[]; total_results?: number };
    console.log(`${p.label} → ${d.total_results ?? 0} results`);
    console.log(`  first 3: ${(d.results ?? []).slice(0, 3).map((r) => r.name).join(", ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
