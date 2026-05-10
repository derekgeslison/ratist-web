import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Use US Eastern time to match primary audience timezone
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${month}-${day}`;
    const today = now;
    const seen = new Set<number>();

    const results: { id: number; name: string; profilePath: string | null; department: string; birthday: string; age: number; popularity: number }[] = [];

    // Source 1: Our own Celebrity cache (fast, reliable if populated)
    try {
      const cached = await prisma.celebrity.findMany({
        where: { birthday: { endsWith: todayStr }, deathday: null, profilePath: { not: null } },
        // nulls: "last" — popularity is nullable; without this, Postgres
        // puts NULL-popularity celebrities first and the famous ones get
        // truncated by the take() limit before they're ever sorted.
        orderBy: { popularity: { sort: "desc", nulls: "last" } },
        take: 20,
      });
      for (const c of cached) {
        seen.add(c.tmdbId);
        results.push({
          id: c.tmdbId, name: c.name, profilePath: c.profilePath,
          department: c.knownForDepartment ?? "Acting", birthday: c.birthday!,
          age: today.getFullYear() - parseInt(c.birthday!.slice(0, 4)),
          popularity: c.popularity ?? 0,
        });
      }
    } catch { /* DB not ready */ }

    // Source 2: Cast from popular movies + shows (broad coverage)
    if (results.length < 8) {
      const [popMovies, topMovies, popShows] = await Promise.all([
        fetchJSON(`https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&page=1`),
        fetchJSON(`https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}&page=1`),
        fetchJSON(`https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}&page=1`),
      ]);

      const mediaItems = [
        ...((popMovies?.results ?? []) as { id: number }[]).slice(0, 10).map((m) => ({ type: "movie", id: m.id })),
        ...((topMovies?.results ?? []) as { id: number }[]).slice(0, 10).map((m) => ({ type: "movie", id: m.id })),
        ...((popShows?.results ?? []) as { id: number }[]).slice(0, 5).map((m) => ({ type: "tv", id: m.id })),
      ];

      const creditResults = await Promise.all(
        mediaItems.map(({ type, id }) => fetchJSON(`https://api.themoviedb.org/3/${type}/${id}/credits?api_key=${API_KEY}`))
      );

      const personIds: number[] = [];
      for (const credits of creditResults) {
        for (const actor of (credits?.cast ?? []).slice(0, 10)) {
          if (!seen.has(actor.id)) { seen.add(actor.id); personIds.push(actor.id); }
        }
      }

      // Also add trending people
      for (const page of [1, 2, 3]) {
        const trending = await fetchJSON(`https://api.themoviedb.org/3/trending/person/week?api_key=${API_KEY}&page=${page}`);
        for (const p of trending?.results ?? []) {
          if (!seen.has(p.id)) { seen.add(p.id); personIds.push(p.id); }
        }
      }

      // Fetch person details in batches and check birthdays
      for (let i = 0; i < personIds.length; i += 30) {
        const batch = personIds.slice(i, i + 30);
        const details = await Promise.all(
          batch.map((id) => fetchJSON(`https://api.themoviedb.org/3/person/${id}?api_key=${API_KEY}`))
        );
        for (const person of details) {
          if (!person?.birthday || person.deathday) continue;
          if (person.birthday.slice(5) === todayStr) {
            results.push({
              id: person.id, name: person.name, profilePath: person.profile_path,
              department: person.known_for_department ?? "Acting", birthday: person.birthday,
              age: today.getFullYear() - parseInt(person.birthday.slice(0, 4)),
              popularity: person.popularity ?? 0,
            });
            // Cache for future lookups
            prisma.celebrity.upsert({
              where: { tmdbId: person.id },
              create: { tmdbId: person.id, name: person.name, profilePath: person.profile_path, knownForDepartment: person.known_for_department, birthday: person.birthday, deathday: person.deathday, popularity: person.popularity, cachedAt: new Date() },
              update: { birthday: person.birthday, popularity: person.popularity, cachedAt: new Date() },
            }).catch(() => {});
          }
        }
      }
    }

    // Deduplicate and sort
    const uniqueMap = new Map<number, (typeof results)[0]>();
    for (const r of results) uniqueMap.set(r.id, r);
    const birthdays = Array.from(uniqueMap.values())
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 12);

    return NextResponse.json({ birthdays });
  } catch (err) {
    console.error("Birthdays error:", err);
    return NextResponse.json({ birthdays: [] });
  }
}

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    return res.ok ? res.json() : null;
  } catch { return null; }
}
