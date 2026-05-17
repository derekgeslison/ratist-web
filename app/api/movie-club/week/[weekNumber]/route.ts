import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { getSuperlatives } from "@/lib/movie-club";
import { hasBackstagePass } from "@/lib/subscription";

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
            id: true, rating: true, reviewText: true, reviewType: true, formData: true, isRewatch: true, createdAt: true,
            user: { select: { firebaseUid: true, name: true, avatarUrl: true } },
            reactions: { select: { userId: true, value: true, user: { select: { firebaseUid: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        rewatchPolls: { select: { vote: true, user: { select: { firebaseUid: true } } } },
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
    // Backstage Pass members get to read past (archived) weeks'
    // discussion rooms even if they didn't participate. Open weeks
    // (discussion phase) still require a submitted rating — the
    // ratings-first gate is part of the active-week experience and
    // we don't want subscribers spoiling themselves on an in-progress
    // discussion before they've watched.
    const isBackstagePass = user ? await hasBackstagePass(user.id) : false;
    const canSeeDiscussion =
      (week.status === "discussion" && hasSubmitted) ||
      (week.status === "archived" && (hasSubmitted || isBackstagePass));
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

    // Rating distribution — 10 buckets matching the movie/show page
    // RatingDistribution component. Each bucket holds "ratings that
    // display with that leading digit" so 9.0 and 9.9 both fall in
    // bucket "9" (display value rounded to 1 decimal, then floored).
    // buckets[0] = displayed 1.0–1.9, ... buckets[9] = displayed 10.0
    const ratingDistribution = canSeeDiscussion ? (() => {
      const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
      const buckets = Array(10).fill(0);
      for (const r of week.ratings) {
        const displayed = Math.round(r.rating * 10) / 10;
        const idx = Math.max(0, Math.min(Math.floor(displayed) - 1, 9));
        buckets[idx]++;
      }
      return labels.map((range, i) => ({ range, count: buckets[i] }));
    })() : [];

    // Category breakdown (averages from standard reviews with formData)
    const standardReviews = canSeeDiscussion
      ? week.ratings.filter((r) => r.reviewType === "standard" && r.formData)
      : [];
    const categoryFields = {
      Story: ["plot", "premiseOriginality", "storytelling", "characterDev", "pacingClimax"],
      Style: ["cinematography", "locationCost", "realism", "artisticEffect", "visualEffects", "musicSound"],
      Emotive: ["overallEmotion", "relatability", "meaning", "movingness"],
      Acting: ["casting", "actingQuality", "dialogueScripting", "blockingChoreo"],
      Entertainment: ["appeal", "choreography"],
    };
    const categoryBreakdown = canSeeDiscussion && standardReviews.length > 0
      ? Object.entries(categoryFields).map(([cat, fields]) => {
          let total = 0, count = 0;
          for (const r of standardReviews) {
            const fd = r.formData as Record<string, unknown>;
            for (const f of fields) {
              if (fd[f] != null && typeof fd[f] === "number") { total += fd[f] as number; count++; }
            }
          }
          return { category: cat, avgScore: count > 0 ? Math.round(total / count * 10) / 10 : null };
        })
      : [];

    // Rewatch poll results
    const rewatchPollResults = canSeeDiscussion
      ? { yes: week.rewatchPolls.filter((p) => p.vote === "yes").length, no: week.rewatchPolls.filter((p) => p.vote === "no").length, maybe: week.rewatchPolls.filter((p) => p.vote === "maybe").length }
      : null;
    const userRewatchVote = user ? week.rewatchPolls.find((p) => p.user.firebaseUid === user.firebaseUid)?.vote ?? null : null;

    // Trivia: production facts pulled from movie metadata, plus the
    // Ratist site-wide Community Rating. The third-party rating field
    // is intentionally not exposed — users care about what the Ratist
    // community thinks, not an outside aggregator.
    const trivia: string[] = [];
    if (canSeeDiscussion && week.movieTmdbId) {
      try {
        const tmdbKey = process.env.TMDB_API_KEY;
        const detRes = await fetch(`https://api.themoviedb.org/3/movie/${week.movieTmdbId}?api_key=${tmdbKey}`, { next: { revalidate: 86400 } });
        if (detRes.ok) {
          const det = await detRes.json();
          if (det.budget && det.budget > 0) trivia.push(`Budget: $${(det.budget / 1e6).toFixed(0)}M`);
          if (det.revenue && det.revenue > 0) trivia.push(`Box Office: $${det.revenue >= 1e9 ? (det.revenue / 1e9).toFixed(1) + "B" : (det.revenue / 1e6).toFixed(0) + "M"}`);
          if (det.budget && det.revenue && det.budget > 0) trivia.push(`ROI: ${((det.revenue / det.budget) * 100).toFixed(0)}%`);
          if (det.production_companies?.length) trivia.push(`Studio: ${det.production_companies.map((c: { name: string }) => c.name).slice(0, 2).join(", ")}`);
          if (det.production_countries?.length) trivia.push(`Filmed in: ${det.production_countries.map((c: { name: string }) => c.name).slice(0, 2).join(", ")}`);
          if (det.spoken_languages?.length > 1) trivia.push(`Languages: ${det.spoken_languages.map((l: { english_name: string }) => l.english_name).join(", ")}`);
        }
      } catch { /* ignore */ }
      // Site-wide Ratist Community Rating (average of all ratistRating
      // values across every reviewer, not just movie-club members).
      if (week.movieId) {
        try {
          const agg = await prisma.movieRating.aggregate({
            where: { movieId: week.movieId, ratistRating: { not: null } },
            _avg: { ratistRating: true },
            _count: { ratistRating: true },
          });
          if (agg._avg.ratistRating != null && agg._count.ratistRating > 0) {
            const reviews = agg._count.ratistRating;
            trivia.push(`Community Rating: ${agg._avg.ratistRating.toFixed(1)}/10 (${reviews.toLocaleString()} review${reviews !== 1 ? "s" : ""})`);
          }
        } catch { /* ignore */ }
      }
    }

    // Enrich ratings with reaction counts for the response
    const enrichedRatings = canSeeDiscussion
      ? week.ratings.map((r) => {
          const agreeCount = r.reactions.filter((x) => x.value === "agree").length;
          const disagreeCount = r.reactions.filter((x) => x.value === "disagree").length;
          const userReaction = user ? r.reactions.find((x) => x.user.firebaseUid === user.firebaseUid)?.value ?? null : null;
          return { ...r, reactions: undefined, agreeCount, disagreeCount, userReaction };
        })
      : [];

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
        ratings: enrichedRatings,
        superlatives,
        prompts: prompts.map((text, i) => ({ text, commentCount: promptCommentCounts[i], targetId: `${week.id}_prompt_${i}` })),
        ratingDistribution,
        categoryBreakdown,
        rewatchPoll: rewatchPollResults,
        trivia,
      },
      isMember,
      userRating,
      userRewatchVote,
      canSeeDiscussion,
    });
  } catch (err) {
    console.error("Movie club week detail error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
