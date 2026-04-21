// Resolve natural-language keyword phrases produced by the AI prompt tools to
// TMDB keyword IDs usable with /discover/*'s with_keywords parameter.
//
// TMDB's /search/keyword returns a paginated list of keywords matching the
// query text. We prefer an exact case-insensitive match on keyword.name; if
// none exists, fall back to the highest-ranked returned result.
//
// IDs are effectively immutable, so a process-lifetime Map is enough — no TTL.
// Misses and unresolved phrases are cached as null so repeated prompts don't
// retry /search/keyword.
import { searchKeywords } from "./tmdb";

const cache = new Map<string, number | null>();

async function resolveOne(phrase: string): Promise<number | null> {
  const key = phrase.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const data = await searchKeywords(key);
    const results = data.results ?? [];
    const exact = results.find((k) => k.name.toLowerCase() === key);
    const pick = exact ?? results[0] ?? null;
    const id = pick?.id ?? null;
    cache.set(key, id);
    return id;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export async function resolveKeywords(phrases: string[]): Promise<number[]> {
  if (!phrases?.length) return [];
  const ids = await Promise.all(phrases.slice(0, 3).map(resolveOne));
  return ids.filter((id): id is number => id != null);
}
