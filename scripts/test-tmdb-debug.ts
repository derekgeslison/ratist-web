import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const key = process.env.TMDB_API_KEY;
  console.log("key length:", key?.length);
  console.log("key prefix:", key?.slice(0, 6));
  // Try /discover/movie (known working)
  const d = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${key}&page=1`);
  console.log("discover/movie:", d.status);
  // Try /search/keyword
  const sk = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${key}&query=future`);
  console.log("search/keyword:", sk.status);
  if (!sk.ok) {
    console.log("body:", await sk.text());
  } else {
    const data = await sk.json();
    console.log("total_results:", data.total_results, "first 3:", data.results?.slice(0, 3));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
