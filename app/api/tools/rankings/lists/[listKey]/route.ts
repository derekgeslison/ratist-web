import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** DELETE — Delete a custom ranking list */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ listKey: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { listKey } = await params;

    // Verify it's a custom list owned by this user
    const list = await prisma.userRankingList.findUnique({
      where: { userId_listKey: { userId: user.id, listKey } },
    });
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Delete all rankings for this list
    await prisma.userMovieRanking.deleteMany({
      where: { userId: user.id, listKey },
    });

    // Delete the list itself
    await prisma.userRankingList.delete({
      where: { userId_listKey: { userId: user.id, listKey } },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete ranking list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — Rename a custom ranking list */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ listKey: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { listKey } = await params;
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const list = await prisma.userRankingList.findUnique({
      where: { userId_listKey: { userId: user.id, listKey } },
    });
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.userRankingList.update({
      where: { userId_listKey: { userId: user.id, listKey } },
      data: { name: name.trim() },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Rename ranking list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — Add a movie to a custom ranking list */
export async function POST(req: NextRequest, { params }: { params: Promise<{ listKey: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { listKey } = await params;
    const { tmdbId, title, posterPath, releaseDate } = await req.json();
    if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 });

    // Verify list exists
    const list = await prisma.userRankingList.findUnique({
      where: { userId_listKey: { userId: user.id, listKey } },
    });
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    // Ensure movie exists
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: posterPath ?? null, releaseDate: releaseDate ?? null },
      update: {},
    });

    // Get current max sortOrder
    const maxRank = await prisma.userMovieRanking.findFirst({
      where: { userId: user.id, listKey },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    // Add at end
    await prisma.userMovieRanking.upsert({
      where: { userId_movieId_listKey: { userId: user.id, movieId: movie.id, listKey } },
      create: { userId: user.id, movieId: movie.id, listKey, sortOrder: (maxRank?.sortOrder ?? -1) + 1 },
      update: {},
    });

    return NextResponse.json({ added: true });
  } catch (err) {
    console.error("Add movie to ranking list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
