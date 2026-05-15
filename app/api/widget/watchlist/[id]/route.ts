import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { IMAGE_BASE_URL } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

// GET /api/widget/watchlist/[id]
//
// Returns a slim payload tuned for native widget rendering:
//   - Up to 8 items (widget grids fit at most ~8 tiles at standard sizes)
//   - Items the user hasn't checked off yet (recently-added first)
//   - Posters as absolute URLs (widgets can't run client-side formatters)
//
// Mixed movies + shows are interleaved by recency of when the user
// added them to the list. mediaType is included so the widget can
// build the right deep-link path on tap (/movies/:tmdbId vs
// /shows/:tmdbId).
//
// Access: owner or accepted collaborator. 403 otherwise.
//
// Shape: { watchlist: { id, name }, items: [{ tmdbId, mediaType, title, posterUrl }] }

const ITEM_CAP = 8;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Verify access: owner OR accepted collaborator.
    const watchlist = await prisma.watchlist.findFirst({
      where: {
        id,
        OR: [
          { userId: user.id },
          { collaborators: { some: { userId: user.id, status: "accepted" } } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [movies, shows] = await Promise.all([
      prisma.watchlistMovie.findMany({
        where: { watchlistId: id, isChecked: false },
        orderBy: { addedAt: "desc" },
        take: ITEM_CAP,
        select: {
          addedAt: true,
          movie: {
            select: { tmdbId: true, title: true, posterPath: true, posterBlocked: true },
          },
        },
      }),
      prisma.watchlistShow.findMany({
        where: { watchlistId: id, isChecked: false },
        orderBy: { addedAt: "desc" },
        take: ITEM_CAP,
        select: {
          addedAt: true,
          tvShow: {
            select: { tmdbId: true, name: true, posterPath: true, posterBlocked: true },
          },
        },
      }),
    ]);

    type Item = {
      tmdbId: number;
      mediaType: "movie" | "tv";
      title: string;
      posterUrl: string | null;
      addedAt: Date;
    };

    const all: Item[] = [
      ...movies
        .filter((m) => !m.movie.posterBlocked)
        .map((m) => ({
          tmdbId: m.movie.tmdbId,
          mediaType: "movie" as const,
          title: m.movie.title,
          posterUrl: m.movie.posterPath ? `${IMAGE_BASE_URL}/w342${m.movie.posterPath}` : null,
          addedAt: m.addedAt,
        })),
      ...shows
        .filter((s) => !s.tvShow.posterBlocked)
        .map((s) => ({
          tmdbId: s.tvShow.tmdbId,
          mediaType: "tv" as const,
          title: s.tvShow.name,
          posterUrl: s.tvShow.posterPath ? `${IMAGE_BASE_URL}/w342${s.tvShow.posterPath}` : null,
          addedAt: s.addedAt,
        })),
    ]
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, ITEM_CAP);

    // Strip addedAt before returning — the widget doesn't need it,
    // and a smaller payload helps over slow mobile networks.
    const items = all.map(({ addedAt: _, ...rest }) => rest);

    return NextResponse.json({
      watchlist: { id: watchlist.id, name: watchlist.name },
      items,
    });
  } catch (err) {
    console.error("[widget/watchlist/[id]] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
