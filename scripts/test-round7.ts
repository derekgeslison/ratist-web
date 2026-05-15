// Verify the fixes from today's round.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const { extractRecommendationFilters } = await import("../lib/ai/recommend-filters");
  const { extractCollectionFilters } = await import("../lib/ai/collection-filters");
  const { resolveCast } = await import("../lib/tmdb-cast");
  const prompts = [
    // Year fixes on collection side
    { p: "from this year", label: "collection current-year" },
    { p: "last 5 years", label: "collection yearFrom-only" },
    { p: "past decade", label: "collection past decade" },
    // MPAA "max" expansion
    { p: "TV-14 max", label: "TV-14 max expands" },
    { p: "PG-13 or lower", label: "PG-13 or lower" },
    { p: "nothing above R", label: "R or lower" },
    { p: "up to PG", label: "PG max" },
    // Min-violence triggers
    { p: "bloody horror", label: "bloody → minViolence" },
    { p: "gory action flick", label: "gory → minViolence" },
    // critically acclaimed → 7.5
    { p: "critically acclaimed films", label: "critically acclaimed 7.5" },
    // Franchise + era (anti-pattern)
    { p: "James Bond", label: "James Bond — should not fill all eras" },
    { p: "Star Wars", label: "Star Wars" },
    // Cast extraction
    { p: "Tom Hanks movies", label: "Cast: Tom Hanks" },
    { p: "with Saoirse Ronan", label: "Cast: Saoirse Ronan" },
    { p: "a Tarantino movie", label: "Cast: Tarantino" },
    { p: "Wes Anderson type stuff", label: "Style — NO cast" },
    { p: "Marvel movies", label: "Franchise — NO cast" },
    { p: "with Tom Hanks or Meryl Streep", label: "Multi cast" },
  ];
  for (const c of prompts) {
    const rec = await extractRecommendationFilters(c.p);
    const col = await extractCollectionFilters(c.p);
    console.log(`[${c.label}] "${c.p}"`);
    console.log(`  REC: yearFrom=${rec.yearFrom} yearTo=${rec.yearTo} mpaa=${JSON.stringify(rec.mpaaRatings)} minViolence=${rec.minViolence} minRating=${rec.minRating} cast=${JSON.stringify(rec.cast)} era=${JSON.stringify(rec.era)}`);
    console.log(`  COL: yearFrom=${col.yearFrom} yearTo=${col.yearTo} mpaa=${JSON.stringify(col.mpaaRatings)} minViolence=${col.minViolence} minRating=${col.minRating} cast=${JSON.stringify(col.cast)}`);
  }
  console.log("\nCast resolver check:");
  const ids = await resolveCast(["Tom Hanks", "Quentin Tarantino", "Saoirse Ronan"]);
  console.log("  resolved person IDs:", ids);
}
main().catch((e) => { console.error(e); process.exit(1); });
