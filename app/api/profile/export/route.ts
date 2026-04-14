import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import JSZip from "jszip";

export const dynamic = "force-dynamic";

function toCsvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map((v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(",");
}

function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join("\n");
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/**
 * GET /api/profile/export
 *
 * Exports all personal data as CSV files in a zip download.
 * Rate limited to once per day.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: {
        id: true, name: true, email: true, bio: true,
        createdAt: true, isPrivate: true, emailOptOut: true,
        lastExportAt: true, isAdmin: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Rate limit: once per day (admins bypass)
    if (!user.isAdmin && user.lastExportAt) {
      const hoursSince = (Date.now() - user.lastExportAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return NextResponse.json(
          { error: `You can export your data once per day. Try again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.` },
          { status: 429 }
        );
      }
    }

    const [ratings, tvRatings, comments, favoriteMovies, favoriteShows, watchlists, badges] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: user.id },
        select: {
          ratistRating: true, overallRating: true, reviewType: true,
          storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
          reviewText: true, createdAt: true,
          movie: { select: { tmdbId: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tVShowRating.findMany({
        where: { userId: user.id },
        select: {
          ratingScope: true, seasonNumber: true,
          ratistRating: true, overallRating: true, reviewType: true,
          reviewText: true, createdAt: true,
          tvShow: { select: { tmdbId: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { userId: user.id },
        select: { targetType: true, text: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movieId: true, watchedDate: true, movie: { select: { tmdbId: true, title: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userFavoriteShow.findMany({
        where: { userId: user.id },
        select: { tvShow: { select: { tmdbId: true, name: true } } },
      }),
      prisma.watchlist.findMany({
        where: { userId: user.id },
        select: {
          name: true,
          movies: { select: { movie: { select: { tmdbId: true, title: true } } } },
          shows: { select: { tvShow: { select: { tmdbId: true, name: true } } } },
        },
      }),
      prisma.userBadge.findMany({
        where: { userId: user.id },
        select: { slug: true, earnedAt: true },
      }),
    ]);

    // Build a movieId→rating lookup for diary enrichment
    const movieRatingMap = new Map<string, { ratistRating: number | null; overallRating: number | null; reviewText: string | null }>();
    const allMovieRatings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      select: { movieId: true, ratistRating: true, overallRating: true, reviewText: true },
    });
    for (const r of allMovieRatings) {
      movieRatingMap.set(r.movieId, { ratistRating: r.ratistRating, overallRating: r.overallRating, reviewText: r.reviewText });
    }

    const zip = new JSZip();

    // account.csv
    zip.file("account.csv", toCsv(
      ["name", "email", "bio", "joined_date", "private"],
      [[user.name, user.email, user.bio, formatDate(user.createdAt), user.isPrivate]],
    ));

    // movie-ratings.csv
    zip.file("movie-ratings.csv", toCsv(
      ["title", "tmdb_id", "ratist_rating", "overall_rating", "review_type", "story", "style", "emotive", "acting", "entertainment", "review_text", "rated_date"],
      ratings.map((r) => [
        r.movie?.title, r.movie?.tmdbId, r.ratistRating, r.overallRating, r.reviewType,
        r.storyScore, r.styleScore, r.emotiveScore, r.actingScore, r.entertainScore,
        r.reviewText, formatDate(r.createdAt),
      ]),
    ));

    // tv-ratings.csv
    zip.file("tv-ratings.csv", toCsv(
      ["show_name", "tmdb_id", "scope", "season_number", "ratist_rating", "overall_rating", "review_type", "review_text", "rated_date"],
      tvRatings.map((r) => [
        r.tvShow?.name, r.tvShow?.tmdbId, r.ratingScope, r.seasonNumber,
        r.ratistRating, r.overallRating, r.reviewType, r.reviewText, formatDate(r.createdAt),
      ]),
    ));

    // diary.csv — all seen movies with date and rating info
    zip.file("diary.csv", toCsv(
      ["title", "tmdb_id", "watched_date", "ratist_rating", "overall_rating", "review_text"],
      favoriteMovies.map((f) => {
        const rating = movieRatingMap.get(f.movieId);
        return [
          f.movie?.title, f.movie?.tmdbId, formatDate(f.watchedDate),
          rating?.ratistRating, rating?.overallRating, rating?.reviewText,
        ];
      }),
    ));

    // seen-shows.csv
    zip.file("seen-shows.csv", toCsv(
      ["show_name", "tmdb_id"],
      favoriteShows.map((f) => [f.tvShow?.name, f.tvShow?.tmdbId]),
    ));

    // watchlists.csv
    const watchlistRows: (string | number | null | undefined)[][] = [];
    for (const w of watchlists) {
      for (const m of w.movies) {
        watchlistRows.push([w.name, "movie", m.movie?.title, m.movie?.tmdbId]);
      }
      for (const s of w.shows) {
        watchlistRows.push([w.name, "tv", s.tvShow?.name, s.tvShow?.tmdbId]);
      }
    }
    zip.file("watchlists.csv", toCsv(
      ["watchlist_name", "item_type", "title", "tmdb_id"],
      watchlistRows,
    ));

    // comments.csv
    zip.file("comments.csv", toCsv(
      ["target_type", "text", "date"],
      comments.map((c) => [c.targetType, c.text, formatDate(c.createdAt)]),
    ));

    // badges.csv
    zip.file("badges.csv", toCsv(
      ["badge", "earned_date"],
      badges.map((b) => [b.slug, formatDate(b.earnedAt)]),
    ));

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    // Record export timestamp
    prisma.user.update({ where: { id: user.id }, data: { lastExportAt: new Date() } }).catch(() => {});

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ratist-export-${formatDate(new Date())}.zip"`,
      },
    });
  } catch (err) {
    console.error("Data export error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
