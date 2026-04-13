import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { syncMovieAwards, syncCelebrityAwards, syncTVShowAwards } from "@/lib/awards-sync";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { entityType, tmdbId } = await req.json();
  if (!entityType || !tmdbId) {
    return NextResponse.json({ error: "entityType and tmdbId required" }, { status: 400 });
  }

  try {
    if (entityType === "movie") {
      const movie = await prisma.movie.findUnique({
        where: { tmdbId: Number(tmdbId) },
        select: { id: true, imdbId: true },
      });
      if (!movie) return NextResponse.json({ error: "Movie not found in DB" }, { status: 404 });

      // Clear sync log only — sync will upsert on top of existing data
      await prisma.awardsSyncLog.deleteMany({
        where: { entityType: "movie", entityId: movie.id },
      });
      const count = await syncMovieAwards(movie.id, Number(tmdbId), movie.imdbId);
      return NextResponse.json({ success: true, count });

    } else if (entityType === "tvshow") {
      const show = await prisma.tVShow.findUnique({
        where: { tmdbId: Number(tmdbId) },
        select: { id: true, imdbId: true },
      });
      if (!show) return NextResponse.json({ error: "Show not found in DB" }, { status: 404 });
      if (!show.imdbId) return NextResponse.json({ error: "Show has no IMDb ID" }, { status: 400 });

      await prisma.awardsSyncLog.deleteMany({
        where: { entityType: "tvshow", entityId: show.id },
      });
      const count = await syncTVShowAwards(show.id, show.imdbId);
      return NextResponse.json({ success: true, count });

    } else if (entityType === "celebrity") {
      const celeb = await prisma.celebrity.findUnique({
        where: { tmdbId: Number(tmdbId) },
        select: { id: true, imdbId: true },
      });
      if (!celeb) return NextResponse.json({ error: "Celebrity not found in DB" }, { status: 404 });

      await prisma.awardsSyncLog.deleteMany({
        where: { entityType: "celebrity", entityId: celeb.id },
      });
      const count = await syncCelebrityAwards(celeb.id, Number(tmdbId), celeb.imdbId);
      return NextResponse.json({ success: true, count });

    } else {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
    }
  } catch (e) {
    console.error("[awards-refresh] Error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
