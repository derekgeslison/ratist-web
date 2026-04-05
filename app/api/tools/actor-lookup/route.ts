import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const personId = req.nextUrl.searchParams.get("personId");
    if (!personId) return NextResponse.json({ movies: [], shows: [] });

    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [], shows: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [], shows: [] });

    // Fetch both movie and TV credits in parallel
    const [movieCreditsRes, tvCreditsRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${API_KEY}`),
      fetch(`https://api.themoviedb.org/3/person/${personId}/tv_credits?api_key=${API_KEY}`),
    ]);

    const [movieData, tvData] = await Promise.all([
      movieCreditsRes.ok ? movieCreditsRes.json() : { cast: [], crew: [] },
      tvCreditsRes.ok ? tvCreditsRes.json() : { cast: [], crew: [] },
    ]);

    // --- Movies ---
    const allMovieCredits = [
      ...(movieData.cast ?? []).map((m: { id: number; title: string; poster_path: string | null; character?: string }) => ({ tmdbId: m.id, title: m.title, poster_path: m.poster_path, character: m.character })),
      ...(movieData.crew ?? []).map((m: { id: number; title: string; poster_path: string | null; job: string }) => ({ tmdbId: m.id, title: m.title, poster_path: m.poster_path, job: m.job })),
    ];

    const movieTmdbIds = [...new Set(allMovieCredits.map((m) => m.tmdbId))];

    const seenMovies = await prisma.movie.findMany({
      where: {
        tmdbId: { in: movieTmdbIds },
        OR: [
          { ratings: { some: { userId: user.id } } },
          { favoritedBy: { some: { userId: user.id } } },
        ],
      },
      include: {
        ratings: { where: { userId: user.id }, select: { ratistRating: true } },
      },
    });

    const seenMovieTmdbIds = new Set(seenMovies.map((m) => m.tmdbId));
    const movieResults = allMovieCredits
      .filter((m) => seenMovieTmdbIds.has(m.tmdbId))
      .map((m) => {
        const dbMovie = seenMovies.find((s) => s.tmdbId === m.tmdbId);
        return {
          tmdbId: m.tmdbId,
          title: m.title,
          posterPath: dbMovie?.posterPath ?? m.poster_path,
          character: m.character,
          ratistRating: dbMovie?.ratings?.[0]?.ratistRating ?? null,
        };
      });

    const seenM = new Set<number>();
    const dedupedMovies = movieResults.filter((m) => { if (seenM.has(m.tmdbId)) return false; seenM.add(m.tmdbId); return true; });

    // --- TV Shows ---
    const allTVCredits = [
      ...(tvData.cast ?? []).map((s: { id: number; name: string; poster_path: string | null; character?: string }) => ({ tmdbId: s.id, title: s.name, poster_path: s.poster_path, character: s.character })),
      ...(tvData.crew ?? []).map((s: { id: number; name: string; poster_path: string | null; job: string }) => ({ tmdbId: s.id, title: s.name, poster_path: s.poster_path, job: s.job })),
    ];

    const tvTmdbIds = [...new Set(allTVCredits.map((s) => s.tmdbId))];

    // Check show-level seen (favorite + ratings)
    const seenShows = await prisma.tVShow.findMany({
      where: {
        tmdbId: { in: tvTmdbIds },
        OR: [
          { ratings: { some: { userId: user.id } } },
          { favoritedBy: { some: { userId: user.id } } },
        ],
      },
      include: {
        ratings: { where: { userId: user.id, ratingScope: "series" }, select: { ratistRating: true } },
      },
    });

    // Also check episode-level seen (user may have watched episodes without show-level favorite)
    const episodeSeenShowIds = await prisma.episodeSeen.findMany({
      where: { userId: user.id, showTmdbId: { in: tvTmdbIds } },
      select: { showTmdbId: true },
      distinct: ["showTmdbId"],
    });

    const seenShowTmdbIds = new Set([
      ...seenShows.map((s) => s.tmdbId),
      ...episodeSeenShowIds.map((e) => e.showTmdbId),
    ]);
    const showResults = allTVCredits
      .filter((s) => seenShowTmdbIds.has(s.tmdbId))
      .map((s) => {
        const dbShow = seenShows.find((d) => d.tmdbId === s.tmdbId);
        return {
          tmdbId: s.tmdbId,
          title: s.title,
          posterPath: dbShow?.posterPath ?? s.poster_path,
          character: s.character,
          ratistRating: dbShow?.ratings?.[0]?.ratistRating ?? null,
        };
      });

    const seenS = new Set<number>();
    const dedupedShows = showResults.filter((s) => { if (seenS.has(s.tmdbId)) return false; seenS.add(s.tmdbId); return true; });

    return NextResponse.json({ movies: dedupedMovies, shows: dedupedShows });
  } catch (err) {
    console.error("Actor lookup error:", err);
    return NextResponse.json({ movies: [], shows: [] });
  }
}
