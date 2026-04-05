import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET — List all custom ranking lists for the user */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const lists = await prisma.userRankingList.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Get movie counts in a single query grouped by listKey
    const counts = await prisma.userMovieRanking.groupBy({
      by: ["listKey"],
      where: { userId: user.id, listKey: { in: lists.map((l) => l.listKey) } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.listKey, c._count._all]));

    const result = lists.map((list) => ({
      ...list,
      movieCount: countMap.get(list.listKey) ?? 0,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("List ranking lists error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — Create a custom ranking list (optionally from a watchlist) */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, fromWatchlistId } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Generate a unique listKey
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const listKey = `custom-${slug}-${Date.now().toString(36)}`;

    const list = await prisma.userRankingList.create({
      data: { userId: user.id, name: name.trim(), listKey },
    });

    // If importing from a watchlist, copy movies
    if (fromWatchlistId) {
      const watchlistMovies = await prisma.watchlistMovie.findMany({
        where: { watchlistId: fromWatchlistId },
        orderBy: { addedAt: "asc" },
        select: { movieId: true },
      });

      if (watchlistMovies.length > 0) {
        await prisma.userMovieRanking.createMany({
          data: watchlistMovies.map((wm, i) => ({
            userId: user.id,
            movieId: wm.movieId,
            listKey,
            sortOrder: i,
          })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json(list, { status: 201 });
  } catch (err) {
    console.error("Create ranking list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
