import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { upsertMovie, upsertTVShow } from "@/lib/tmdb-sync";
import { getMovieDetails, getShowDetails } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/**
 * GET — list every movie/TV row with posterBlocked or (movies only)
 * mediaBlocked set, so admins can review and unblock individual items
 * from the moderation page. Intentionally EXCLUDES `isAdult=true`
 * rows (admin "hide entirely" hides are managed separately).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [movies, shows] = await Promise.all([
    prisma.movie.findMany({
      where: {
        OR: [{ posterBlocked: true }, { mediaBlocked: true }],
        isAdult: false,
      },
      select: { tmdbId: true, title: true, releaseDate: true, posterBlocked: true, mediaBlocked: true },
      orderBy: { title: "asc" },
    }),
    prisma.tVShow.findMany({
      where: { posterBlocked: true },
      select: { tmdbId: true, name: true, firstAirDate: true, posterBlocked: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    movies: movies.map((m) => ({
      tmdbId: m.tmdbId,
      title: m.title,
      releaseDate: m.releaseDate?.slice(0, 10) ?? null,
      posterBlocked: m.posterBlocked,
      mediaBlocked: m.mediaBlocked,
    })),
    shows: shows.map((s) => ({
      tmdbId: s.tmdbId,
      title: s.name,
      releaseDate: s.firstAirDate?.slice(0, 10) ?? null,
      posterBlocked: s.posterBlocked,
    })),
  });
}

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, isAdmin: true } });
  return user?.isAdmin ? user : null;
}

/**
 * Toggle `posterBlocked` on a movie or TV show. Accepts either a
 * single (mediaType, tmdbId) target or a bulk array of (mediaType,
 * tmdbId, blocked) entries (used by the celebrity filmography
 * "Block all posters" action so an admin can quickly suppress an
 * actor's entire credit list).
 *
 * For single-target calls we upsert the DB row first if it doesn't
 * yet exist — many browse-surface TMDB IDs aren't in our cache, so
 * "block this poster" needs to work even on the first encounter.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // `blocked` (poster), `mediaBlocked` (Media tab images on movies),
  // and `hideEntirely` (isAdult — vanish from every list / search /
  // discovery surface) are independent toggles. Callers can pass any
  // combination; absent fields leave the existing state alone.
  // mediaBlocked + hideEntirely are movie-only; both are ignored on
  // TV rows since the show data model only carries posterBlocked.
  const body = await req.json().catch(() => null) as
    | { mediaType: "movie" | "tv"; tmdbId: number; blocked?: boolean; mediaBlocked?: boolean; hideEntirely?: boolean }
    | { items: Array<{ mediaType: "movie" | "tv"; tmdbId: number; blocked?: boolean; mediaBlocked?: boolean; hideEntirely?: boolean }> }
    | null;
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

  const items = "items" in body ? body.items : [body];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items" }, { status: 400 });
  }

  let movieCount = 0;
  let showCount = 0;

  for (const item of items) {
    if (typeof item.tmdbId !== "number" || (item.mediaType !== "movie" && item.mediaType !== "tv")) continue;
    if (item.mediaType === "movie") {
      // Ensure the row exists. The DB cache only contains films users
      // have interacted with; an admin blocking a poster on a fresh
      // browse-rail surface needs the row created so the mask sticks.
      const existing = await prisma.movie.findUnique({ where: { tmdbId: item.tmdbId }, select: { id: true } });
      if (!existing) {
        try {
          const tmdb = await getMovieDetails(item.tmdbId);
          await upsertMovie(tmdb);
        } catch { continue; }
      }
      const data: { posterBlocked?: boolean; mediaBlocked?: boolean; isAdult?: boolean } = {};
      if (typeof item.blocked === "boolean") data.posterBlocked = item.blocked;
      if (typeof item.mediaBlocked === "boolean") data.mediaBlocked = item.mediaBlocked;
      // Full-hide: drive the same `isAdult` flag the TMDB-adult sync
      // uses, so the existing safeguard pipeline vanishes the title
      // from every list / search / discovery rail. Poster + media
      // implicitly get masked too — we set them on-the-side so the
      // detail page (admin-only access for isAdult titles is acceptable
      // since admins can still surface the row from /admin) at least
      // shows the placeholder if visited directly.
      if (typeof item.hideEntirely === "boolean") {
        data.isAdult = item.hideEntirely;
        if (item.hideEntirely) {
          data.posterBlocked = true;
          data.mediaBlocked = true;
        }
      }
      if (Object.keys(data).length === 0) continue;
      await prisma.movie.update({ where: { tmdbId: item.tmdbId }, data });
      movieCount++;
    } else {
      // TV rows don't carry mediaBlocked; ignore that field here.
      if (typeof item.blocked !== "boolean") continue;
      const existing = await prisma.tVShow.findUnique({ where: { tmdbId: item.tmdbId }, select: { id: true } });
      if (!existing) {
        try {
          const tmdb = await getShowDetails(item.tmdbId);
          await upsertTVShow(tmdb);
        } catch { continue; }
      }
      await prisma.tVShow.update({
        where: { tmdbId: item.tmdbId },
        data: { posterBlocked: item.blocked },
      });
      showCount++;
    }
  }

  return NextResponse.json({ ok: true, movieCount, showCount });
}
