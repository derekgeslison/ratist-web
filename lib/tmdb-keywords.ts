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

export interface ResolvedKeyword { id: number; name: string; }

const cache = new Map<string, ResolvedKeyword | null>();

async function resolveOne(phrase: string): Promise<ResolvedKeyword | null> {
  const key = phrase.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const data = await searchKeywords(key);
    const results = data.results ?? [];
    const exact = results.find((k) => k.name.toLowerCase() === key);
    const pick = exact ?? results[0] ?? null;
    const out = pick ? { id: pick.id, name: pick.name } : null;
    cache.set(key, out);
    return out;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export async function resolveKeywords(phrases: string[]): Promise<number[]> {
  const full = await resolveKeywordsFull(phrases);
  return full.map((k) => k.id);
}

export async function resolveKeywordsFull(phrases: string[]): Promise<ResolvedKeyword[]> {
  if (!phrases?.length) return [];
  const out = await Promise.all(phrases.slice(0, 3).map(resolveOne));
  return out.filter((k): k is ResolvedKeyword => k != null);
}

/**
 * Like resolveKeywords, but also returns the original phrases that
 * TMDB couldn't match. Callers (e.g. /recommend) surface these back
 * to the user so it's visible when an AI-extracted keyword silently
 * disappeared from the actual search.
 */
export async function resolveKeywordsWithUnresolved(phrases: string[]): Promise<{ ids: number[]; unresolved: string[] }> {
  if (!phrases?.length) return { ids: [], unresolved: [] };
  const sliced = phrases.slice(0, 3);
  const resolved = await Promise.all(sliced.map(resolveOne));
  const ids: number[] = [];
  const unresolved: string[] = [];
  for (let i = 0; i < sliced.length; i++) {
    const r = resolved[i];
    if (r) ids.push(r.id);
    else unresolved.push(sliced[i]);
  }
  return { ids, unresolved };
}
