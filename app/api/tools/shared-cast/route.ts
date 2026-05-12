import { NextRequest, NextResponse } from "next/server";
import { maskBlockedInResponse } from "@/lib/safe-content";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

async function tmdb<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}?api_key=${API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

interface CreditsResponse {
  cast: { id: number; name: string; profile_path: string | null; character?: string }[];
  crew: { id: number; name: string; profile_path: string | null; job: string }[];
}
interface CombinedCreditsResponse {
  cast: { id: number; title?: string; name?: string; media_type: string; poster_path: string | null; release_date?: string; first_air_date?: string; character?: string; genre_ids?: number[] }[];
  crew: { id: number; title?: string; name?: string; media_type: string; poster_path: string | null; release_date?: string; first_air_date?: string; job: string; genre_ids?: number[] }[];
}

// TMDB TV genre IDs. Talk/news shows accumulate huge guest lists across
// the same actors and directors (late-night appearances, press tours),
// which would otherwise flood People → find shared works with spurious
// matches that aren't really "shared work" in any meaningful sense.
const TV_GENRE_NEWS = 10763;
const TV_GENRE_TALK = 10767;
function isTalkOrNewsTv(mediaType: string, genreIds?: number[]): boolean {
  if (mediaType !== "tv") return false;
  const ids = genreIds ?? [];
  return ids.includes(TV_GENRE_NEWS) || ids.includes(TV_GENRE_TALK);
}

export async function POST(req: NextRequest) {
  try {
    const { mode, ids, mediaTypes, minOverlap = 2 } = await req.json();

    if (mode === "movies-to-people") {
      const settled = await Promise.allSettled(
        ids.map((id: number, i: number) => {
          const mt = mediaTypes?.[i] ?? "movie";
          return mt === "tv"
            ? tmdb<CreditsResponse>(`/tv/${id}/credits`)
            : tmdb<CreditsResponse>(`/movie/${id}/credits`);
        })
      );
      const creditsArr = settled.map((r) => r.status === "fulfilled" ? r.value : null);

      // personId -> { name, profile_path, appearances: {movieId: role} }
      const personMap = new Map<number, { name: string; profile_path: string | null; appearances: Map<number, string> }>();

      ids.forEach((movieId: number, idx: number) => {
        const credits = creditsArr[idx];
        if (!credits) return;
        const seenForThisMovie = new Set<number>();

        for (const c of credits.cast) {
          if (!seenForThisMovie.has(c.id)) {
            seenForThisMovie.add(c.id);
            const existing = personMap.get(c.id) ?? { name: c.name, profile_path: c.profile_path, appearances: new Map<number, string>() };
            existing.appearances.set(movieId, c.character || "Actor");
            personMap.set(c.id, existing);
          }
        }
        for (const c of credits.crew) {
          if (["Director", "Producer", "Writer", "Screenplay", "Composer", "Cinematographer"].includes(c.job)) {
            if (!seenForThisMovie.has(c.id)) {
              seenForThisMovie.add(c.id);
              const existing = personMap.get(c.id) ?? { name: c.name, profile_path: c.profile_path, appearances: new Map<number, string>() };
              existing.appearances.set(movieId, `(${c.job})`);
              personMap.set(c.id, existing);
            }
          }
        }
      });

      const results = Array.from(personMap.entries())
        .filter(([, v]) => v.appearances.size >= minOverlap)
        .sort((a, b) => b[1].appearances.size - a[1].appearances.size)
        .map(([id, v]) => ({
          id,
          name: v.name,
          profile_path: v.profile_path,
          count: v.appearances.size,
          // appearances as plain object for JSON serialization
          appearances: Object.fromEntries(v.appearances),
        }));

      return NextResponse.json(await maskBlockedInResponse({ results }));

    } else {
      // People → find movies & TV shows
      const settled = await Promise.allSettled(
        ids.map((id: number) => tmdb<CombinedCreditsResponse>(`/person/${id}/combined_credits`))
      );
      const creditsArr = settled.map((r) => r.status === "fulfilled" ? r.value : null);

      // itemId -> { title, poster_path, release_date, mediaType, appearances: {personId: role} }
      const movieMap = new Map<number, { title: string; poster_path: string | null; release_date: string; mediaType: string; appearances: Map<number, string> }>();

      ids.forEach((personId: number, idx: number) => {
        const credits = creditsArr[idx];
        if (!credits) return;
        const seenForThisPerson = new Set<number>();

        for (const m of credits.cast) {
          if (isTalkOrNewsTv(m.media_type, m.genre_ids)) continue;
          if (!seenForThisPerson.has(m.id)) {
            seenForThisPerson.add(m.id);
            const title = m.title ?? m.name ?? "";
            const releaseDate = m.release_date ?? m.first_air_date ?? "";
            const existing = movieMap.get(m.id) ?? { title, poster_path: m.poster_path, release_date: releaseDate, mediaType: m.media_type, appearances: new Map<number, string>() };
            existing.appearances.set(personId, m.character || "Actor");
            movieMap.set(m.id, existing);
          }
        }
        for (const m of credits.crew) {
          if (isTalkOrNewsTv(m.media_type, m.genre_ids)) continue;
          if (!seenForThisPerson.has(m.id)) {
            seenForThisPerson.add(m.id);
            const title = m.title ?? m.name ?? "";
            const releaseDate = m.release_date ?? m.first_air_date ?? "";
            const existing = movieMap.get(m.id) ?? { title, poster_path: m.poster_path, release_date: releaseDate, mediaType: m.media_type, appearances: new Map<number, string>() };
            existing.appearances.set(personId, `(${m.job})`);
            movieMap.set(m.id, existing);
          }
        }
      });

      const results = Array.from(movieMap.entries())
        .filter(([, v]) => v.appearances.size >= minOverlap)
        .sort((a, b) => b[1].appearances.size - a[1].appearances.size || (b[1].release_date ?? "").localeCompare(a[1].release_date ?? ""))
        .map(([id, v]) => ({
          id,
          title: v.title,
          poster_path: v.poster_path,
          release_date: v.release_date,
          mediaType: v.mediaType,
          count: v.appearances.size,
          appearances: Object.fromEntries(v.appearances),
        }));

      return NextResponse.json(await maskBlockedInResponse({ results }));
    }
  } catch (err) {
    console.error("Shared cast error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
