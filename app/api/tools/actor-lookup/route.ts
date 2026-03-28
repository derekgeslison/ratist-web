import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const personId = req.nextUrl.searchParams.get("personId");
    if (!personId) return NextResponse.json({ movies: [] });

    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [] });

    // Get all movies/credits for this person from TMDB
    const res = await fetch(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${API_KEY}`);
    const data = await res.json();

    const allMovieTmdbIds = [
      ...(data.cast ?? []).map((m: { id: number; title: string; poster_path: string | null; character?: string }) => ({ tmdbId: m.id, title: m.title, poster_path: m.poster_path, character: m.character })),
      ...(data.crew ?? []).map((m: { id: number; title: string; poster_path: string | null; job: string }) => ({ tmdbId: m.id, title: m.title, poster_path: m.poster_path, job: m.job })),
    ];

    const tmdbIdSet = [...new Set(allMovieTmdbIds.map((m) => m.tmdbId))];

    // Find which ones the user has seen (rated OR in favorites)
    const seenMovies = await prisma.movie.findMany({
      where: {
        tmdbId: { in: tmdbIdSet },
        OR: [
          { ratings: { some: { userId: user.id } } },
          { favoritedBy: { some: { userId: user.id } } },
        ],
      },
      include: {
        ratings: { where: { userId: user.id }, select: { ratistRating: true } },
      },
    });

    const seenTmdbIds = new Set(seenMovies.map((m) => m.tmdbId));

    const movies = allMovieTmdbIds
      .filter((m) => seenTmdbIds.has(m.tmdbId))
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

    // Deduplicate
    const seen = new Set<number>();
    const deduped = movies.filter((m) => { if (seen.has(m.tmdbId)) return false; seen.add(m.tmdbId); return true; });

    return NextResponse.json({ movies: deduped });
  } catch (err) {
    console.error("Actor lookup error:", err);
    return NextResponse.json({ movies: [] });
  }
}
