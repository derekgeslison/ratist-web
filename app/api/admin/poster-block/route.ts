import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { upsertMovie, upsertTVShow } from "@/lib/tmdb-sync";
import { getMovieDetails, getShowDetails } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

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

  // `blocked` (poster) and `mediaBlocked` (Media tab images on movies)
  // are independent toggles. Callers can pass either or both; absent
  // fields leave the existing state alone. mediaBlocked is movie-only;
  // it's ignored on TV rows since the show data model doesn't have it.
  const body = await req.json().catch(() => null) as
    | { mediaType: "movie" | "tv"; tmdbId: number; blocked?: boolean; mediaBlocked?: boolean }
    | { items: Array<{ mediaType: "movie" | "tv"; tmdbId: number; blocked?: boolean; mediaBlocked?: boolean }> }
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
      const data: { posterBlocked?: boolean; mediaBlocked?: boolean } = {};
      if (typeof item.blocked === "boolean") data.posterBlocked = item.blocked;
      if (typeof item.mediaBlocked === "boolean") data.mediaBlocked = item.mediaBlocked;
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
