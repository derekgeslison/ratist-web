// Resolve actor/director names extracted from AI prompts to TMDB person IDs.
// TMDB's /discover/movie accepts `with_cast=id1,id2,...` for actors. Directors
// require /discover/movie?with_crew or per-person movie_credits filtering,
// which is expensive — for now we only support actor matching via `with_cast`.
//
// Matcher:
//   1. Query /search/person?query=<name>
//   2. Among results where known_for_department === "Acting", pick the most
//      popular. If none match, fall back to the top-ranked result.
//
// Cached in-memory for the process lifetime (person IDs are stable).

import { IMAGE_BASE_URL } from "./tmdb";
void IMAGE_BASE_URL; // re-exported for parity / downstream usage

interface PersonSearchResult {
  id: number;
  name: string;
  known_for_department?: string;
  popularity?: number;
  profile_path?: string | null;
}

export interface ResolvedPerson { id: number; name: string; }

const cache = new Map<string, ResolvedPerson | null>();

async function searchPerson(query: string): Promise<PersonSearchResult[]> {
  const API_KEY = process.env.TMDB_API_KEY;
  if (!API_KEY) return [];
  const url = `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { results?: PersonSearchResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

async function resolveOne(name: string): Promise<ResolvedPerson | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const results = await searchPerson(name.trim());
  // Prefer Acting department; within that, pick highest popularity. Fall back
  // to top result overall if no actors returned.
  const actors = results.filter((r) => r.known_for_department === "Acting");
  const pool = actors.length > 0 ? actors : results;
  const pick = pool.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  const out = pick ? { id: pick.id, name: pick.name } : null;
  cache.set(key, out);
  return out;
}

export async function resolveCast(names: string[]): Promise<number[]> {
  const full = await resolveCastFull(names);
  return full.map((p) => p.id);
}

export async function resolveCastFull(names: string[]): Promise<ResolvedPerson[]> {
  if (!names?.length) return [];
  const out = await Promise.all(names.slice(0, 3).map(resolveOne));
  return out.filter((p): p is ResolvedPerson => p != null);
}

/**
 * Like resolveCast, but also returns the original names TMDB couldn't
 * match. Used by /recommend to tell the user when an AI-extracted
 * actor name was silently dropped.
 */
export async function resolveCastWithUnresolved(names: string[]): Promise<{ ids: number[]; unresolved: string[] }> {
  if (!names?.length) return { ids: [], unresolved: [] };
  const sliced = names.slice(0, 3);
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
