import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { getSuperlatives } from "@/lib/movie-club";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, firebaseUid: true } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ weekNumber: string }> }) {
  try {
    const { weekNumber } = await params;
    const user = await getUser(req);

    const week = await prisma.movieClubWeek.findUnique({
      where: { weekNumber: Number(weekNumber) },
      include: {
        ratings: {
          select: {
            id: true, rating: true, reviewText: true, reviewType: true, isRewatch: true, createdAt: true,
            user: { select: { firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { ratings: true } },
      },
    });

    if (!week) return NextResponse.json({ error: "Week not found" }, { status: 404 });

    // Fetch movie details from TMDB for year, runtime, MPA, streaming
    let movieDetails: { year?: string; runtime?: string; mpaRating?: string; streaming?: string[] } = {};
    if (week.movieTmdbId) {
      try {
        const API_KEY = process.env.TMDB_API_KEY;
        const [detailRes, provRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/${week.movieTmdbId}?api_key=${API_KEY}&append_to_response=release_dates`),
          fetch(`https://api.themoviedb.org/3/movie/${week.movieTmdbId}/watch/providers?api_key=${API_KEY}`),
        ]);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          movieDetails.year = detail.release_date?.slice(0, 4);
          movieDetails.runtime = detail.runtime ? `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m` : undefined;
          const usRelease = detail.release_dates?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
          movieDetails.mpaRating = usRelease?.release_dates?.find((d: { certification: string }) => d.certification)?.certification;
        }
        if (provRes.ok) {
          const prov = await provRes.json();
          const us = prov.results?.US;
          movieDetails.streaming = (us?.flatrate ?? []).map((p: { provider_name: string }) => p.provider_name).slice(0, 4);
        }
      } catch { /* ignore */ }
    }

    // Check membership and user's rating
    let isMember = false;
    let userRating: { rating: number; reviewText: string | null } | null = null;
    if (user) {
      const membership = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
      isMember = !!membership;
      const ur = await prisma.movieClubRating.findUnique({
        where: { userId_weekId: { userId: user.id, weekId: week.id } },
        select: { rating: true, reviewText: true, reviewType: true, formData: true },
      });
      userRating = ur;
    }

    const hasSubmitted = !!userRating;
    const canSeeDiscussion = (week.status === "discussion" || week.status === "archived") && hasSubmitted;
    const avgRating = week.ratings.length > 0
      ? Math.round(week.ratings.reduce((s, r) => s + r.rating, 0) / week.ratings.length * 10) / 10
      : null;

    const superlatives = canSeeDiscussion ? await getSuperlatives(week.id) : [];

    // Comment counts for discussion prompts
    const prompts = [
      "What surprised you about this movie?",
      "Best scene or moment?",
      "What would you change about this movie if you could?",
      "How does this compare to the director's other work?",
      "Open Discussion",
    ];
    const promptCommentCounts = canSeeDiscussion
      ? await Promise.all(prompts.map(async (_, i) => {
          const count = await prisma.comment.count({
            where: { targetType: "movieclub_prompt", targetId: `${week.id}_prompt_${i}` },
          });
          return count;
        }))
      : prompts.map(() => 0);

    return NextResponse.json({
      week: {
        id: week.id,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
        status: week.status,
        pickMethod: week.pickMethod,
        movieTmdbId: week.movieTmdbId,
        movieTitle: week.movieTitle,
        moviePoster: week.moviePoster,
        movieYear: movieDetails.year,
        movieRuntime: movieDetails.runtime,
        movieMpaRating: movieDetails.mpaRating,
        movieStreaming: movieDetails.streaming,
        participantCount: week._count.ratings,
        rewatchCount: week.ratings.filter((r) => r.isRewatch).length,
        avgRating: canSeeDiscussion ? avgRating : null,
        ratings: canSeeDiscussion ? week.ratings : [],
        superlatives,
        prompts: prompts.map((text, i) => ({ text, commentCount: promptCommentCounts[i], targetId: `${week.id}_prompt_${i}` })),
      },
      isMember,
      userRating,
      canSeeDiscussion,
    });
  } catch (err) {
    console.error("Movie club week detail error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
