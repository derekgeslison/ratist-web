import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, autoDateOnSeen: true } });
  } catch {
    return null;
  }
}

/**
 * Per-episode quick ratings. Intentionally simple — single 1–10 score,
 * no rubric, no comments. Designed to coexist with EpisodeSeen and
 * with the full TVShowRating rubric (which lives at series or
 * per-season scope), without contributing to the user's taste profile.
 *
 * Side effect: creating/updating a rating also ensures an EpisodeSeen
 * row exists. The reverse is NOT true — you can mark seen without
 * rating. Trying to UNSEE an episode that has a rating is refused at
 * the seen route (see app/api/shows/[id]/episodes/seen/route.ts).
 */

// GET: viewer's per-episode ratings for this show + community
// averages keyed by `${season}-${episode}` (computed across all
// rating rows, regardless of viewer auth).
export async function GET(req: NextRequest, { params }: Props) {
  const { id } = await params;
  const showTmdbId = Number(id);
  if (!Number.isFinite(showTmdbId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Community averages: groupBy episode, compute avg. Runs even for
  // anonymous viewers so the show page can render community signals.
  const groups = await prisma.episodeRating.groupBy({
    by: ["seasonNumber", "episodeNumber"],
    where: { showTmdbId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const communityAverages: Record<string, { avg: number; count: number }> = {};
  for (const g of groups) {
    if (g._avg.rating != null) {
      communityAverages[`${g.seasonNumber}-${g.episodeNumber}`] = {
        avg: Math.round(g._avg.rating * 10) / 10,
        count: g._count.rating,
      };
    }
  }

  // Viewer's own ratings, if signed in.
  const user = await getUser(req);
  let myRatings: Array<{ seasonNumber: number; episodeNumber: number; rating: number }> = [];
  if (user) {
    const rows = await prisma.episodeRating.findMany({
      where: { userId: user.id, showTmdbId },
      select: { seasonNumber: true, episodeNumber: true, rating: true },
      orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    });
    myRatings = rows;
  }

  return NextResponse.json({ ratings: myRatings, communityAverages });
}

// POST: upsert a per-episode rating. Side-effect: ensures an
// EpisodeSeen row exists for the same episode. Body:
//   { seasonNumber, episodeNumber, rating (1–10) }
export async function POST(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const showTmdbId = Number(id);
  if (!Number.isFinite(showTmdbId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null) as { seasonNumber?: number; episodeNumber?: number; rating?: number; showName?: string; posterPath?: string } | null;
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });
  const { seasonNumber, episodeNumber, rating } = body;
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number" || typeof rating !== "number") {
    return NextResponse.json({ error: "seasonNumber, episodeNumber, rating required" }, { status: 400 });
  }
  if (rating < 1 || rating > 10 || !Number.isFinite(rating) || (rating * 2) % 1 !== 0) {
    return NextResponse.json({ error: "Rating must be between 1 and 10 in 0.5 increments" }, { status: 400 });
  }

  // Ensure the show row exists so the seen-side bookkeeping (which
  // links to TVShow via tvShowId) has a target. Same upsert pattern
  // as the seen route.
  const tvShow = await prisma.tVShow.upsert({
    where: { tmdbId: showTmdbId },
    create: { tmdbId: showTmdbId, name: body.showName ?? "Unknown", posterPath: body.posterPath ?? null },
    update: {},
  });

  // Upsert rating + ensure seen + ensure show-level seen, in parallel.
  // EpisodeSeen and UserFavoriteShow rows are kept idempotent via
  // upsert / skipDuplicates.
  await Promise.all([
    prisma.episodeRating.upsert({
      where: { userId_showTmdbId_seasonNumber_episodeNumber: { userId: user.id, showTmdbId, seasonNumber, episodeNumber } },
      create: { userId: user.id, showTmdbId, seasonNumber, episodeNumber, rating },
      update: { rating },
    }),
    prisma.episodeSeen.upsert({
      where: { userId_showTmdbId_seasonNumber_episodeNumber: { userId: user.id, showTmdbId, seasonNumber, episodeNumber } },
      create: {
        userId: user.id,
        showTmdbId,
        seasonNumber,
        episodeNumber,
        watchedDate: user.autoDateOnSeen ? new Date() : null,
      },
      update: {},
    }),
    prisma.userFavoriteShow.upsert({
      where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
      create: { userId: user.id, tvShowId: tvShow.id },
      update: {},
    }),
  ]);

  return NextResponse.json({ ok: true, rating, seasonNumber, episodeNumber });
}

// DELETE: remove the viewer's rating for one episode. Keeps the
// EpisodeSeen row — removing the rating doesn't un-watch the episode.
// Body: { seasonNumber, episodeNumber }
export async function DELETE(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const showTmdbId = Number(id);
  if (!Number.isFinite(showTmdbId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null) as { seasonNumber?: number; episodeNumber?: number } | null;
  if (!body || typeof body.seasonNumber !== "number" || typeof body.episodeNumber !== "number") {
    return NextResponse.json({ error: "seasonNumber, episodeNumber required" }, { status: 400 });
  }

  await prisma.episodeRating.deleteMany({
    where: { userId: user.id, showTmdbId, seasonNumber: body.seasonNumber, episodeNumber: body.episodeNumber },
  });

  return NextResponse.json({ ok: true, seasonNumber: body.seasonNumber, episodeNumber: body.episodeNumber });
}
