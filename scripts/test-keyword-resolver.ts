// Dynamic import ensures dotenv loads BEFORE lib/tmdb.ts captures
// process.env.TMDB_API_KEY at module parse.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  console.log("TMDB_API_KEY present:", !!process.env.TMDB_API_KEY);
  const { searchKeywords } = await import("../lib/tmdb");
  const { resolveKeywords } = await import("../lib/tmdb-keywords");
  const probes = ["future", "christmas", "time loop", "road trip", "heist", "found footage", "post-apocalyptic", "dystopia", "halloween", "mockumentary", "one-shot", "serial killer", "first contact", "high school", "wedding", "prison", "courtroom", "world war ii", "valentine's day", "space"];
  for (const q of probes) {
    try {
      const raw = await searchKeywords(q);
      const top = (raw.results ?? []).slice(0, 2).map((k) => `${k.id}:${k.name}`).join(", ");
      const resolved = await resolveKeywords([q]);
      console.log(`${q.padEnd(22)}  results=${(raw.results ?? []).length.toString().padStart(3)}  resolved=${JSON.stringify(resolved).padEnd(10)}  top: ${top}`);
    } catch (e) {
      console.log(`${q} → error`, e instanceof Error ? e.message : e);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
