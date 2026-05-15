// Investigate the user's "tv show that is a comedy or an action show" case.
// Also test AND/OR phrasing variations and TV genre mapping for movie-only
// genres (Romance, Horror, Music, Thriller, War, History, TV Movie).
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const { extractRecommendationFilters } = await import("../lib/ai/recommend-filters");
  const cases = [
    // User's exact prompt:
    "a tv show that is a comedy or an action show",
    // OR-phrasing variants:
    "TV shows that are comedy or action",
    "action or comedy shows",
    // AND-phrasing (should AND):
    "a comedy, drama tv show",
    "a drama and comedy TV series",
    "TV show with action and comedy",
    "comedy drama shows",
    // Movie-only genre on TV side:
    "TV romance",
    "a romantic TV show",
    "horror TV",
    "a scary TV show",
    "TV thriller",
    "war TV show",
    "music TV show",
    // History (movie-only — no TV equivalent):
    "historical TV drama",
    // Movie multi-genre:
    "sci-fi comedy movie",
    "action adventure movie",
    "a dark, mind-bending thriller film",
  ];
  for (const prompt of cases) {
    const f = await extractRecommendationFilters(prompt);
    console.log(`> ${prompt}`);
    console.log(`  mediaType=${f.mediaType}  genres=${JSON.stringify(f.genres)}  genreMode=${f.genreMode}  moods=${JSON.stringify(f.moods)}  excludeGenres=${JSON.stringify(f.excludeGenres)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
