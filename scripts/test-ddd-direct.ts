import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const DDD = "https://www.doesthedogdie.com";
const KEY = process.env.DDD_API_KEY;

async function probe(title: string, tmdbId: number) {
  console.log(`\n=== "${title}" (tmdbId ${tmdbId}) ===`);
  if (!KEY) { console.log("No DDD_API_KEY"); return; }

  // Search by title
  const titleRes = await fetch(`${DDD}/dddsearch?q=${encodeURIComponent(title)}`, {
    headers: { "X-API-KEY": KEY, Accept: "application/json" },
  });
  console.log(`  title-search HTTP ${titleRes.status}`);
  if (titleRes.ok) {
    const data = await titleRes.json() as { items?: { id: number; name: string; tmdbid?: number }[] };
    console.log(`  title-search returned ${data.items?.length ?? 0} items`);
    const match = data.items?.find((i) => i.tmdbid === tmdbId);
    console.log(`  exact tmdbid match: ${match ? `YES (ddd id=${match.id})` : "NO"}`);
    if (data.items && data.items.length > 0) {
      console.log(`  first 3:`, data.items.slice(0, 3).map((i) => `${i.id}:${i.name}(tmdb=${i.tmdbid ?? "—"})`));
    }
  } else {
    console.log(`  body:`, (await titleRes.text()).slice(0, 200));
  }

  // Search by TMDB ID
  const idRes = await fetch(`${DDD}/dddsearch?q=${tmdbId}`, {
    headers: { "X-API-KEY": KEY, Accept: "application/json" },
  });
  console.log(`  id-search HTTP ${idRes.status}`);
  if (idRes.ok) {
    const data = await idRes.json() as { items?: { id: number; name: string; tmdbid?: number }[] };
    console.log(`  id-search returned ${data.items?.length ?? 0} items`);
    const match = data.items?.find((i) => i.tmdbid === tmdbId);
    console.log(`  exact tmdbid match: ${match ? `YES (ddd id=${match.id})` : "NO"}`);
  }
}

async function main() {
  // Known-popular movies, various eras
  await probe("Dune", 693134);         // Dune (2021)
  await probe("The Dark Knight", 155); // classic blockbuster
  await probe("Inception", 27205);
  await probe("Oppenheimer", 872585);
  await probe("The Godfather", 238);
}
main().catch((e) => { console.error(e); process.exit(1); });
