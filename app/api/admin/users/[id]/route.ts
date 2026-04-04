import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// GET /api/admin/users/[id] — detailed user info
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, firebaseUid: true, name: true, email: true, avatarUrl: true,
      bio: true, isAdmin: true, isPrivate: true, inviteCode: true,
      createdAt: true, updatedAt: true,
      deletedAt: true, deletedBy: true,
      bannedAt: true, bannedUntil: true, banReason: true,
      _count: {
        select: {
          ratings: true,
          favoriteMovies: true,
          comments: true,
          forumThreads: true,
          forumPosts: true,
          hotTakes: true,
          recasts: true,
          looksLikes: true,
          screeningSessionsHosted: true,
          screeningParticipations: true,
          watchlistsOwned: true,
          reportsMade: true,
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Reports against this user's content
  const reportsAgainst = await prisma.report.count({
    where: {
      status: { not: "dismissed" },
      OR: [
        { targetType: "review", targetId: { in: (await prisma.movieRating.findMany({ where: { userId: id }, select: { id: true } })).map(r => r.id) } },
        { targetType: "comment", targetId: { in: (await prisma.comment.findMany({ where: { userId: id }, select: { id: true } })).map(c => c.id) } },
        { targetType: "hotTake", targetId: { in: (await prisma.hotTake.findMany({ where: { userId: id }, select: { id: true } })).map(t => t.id) } },
        { targetType: "forumPost", targetId: { in: (await prisma.forumPost.findMany({ where: { authorId: id }, select: { id: true } })).map(p => p.id) } },
      ],
    },
  });

  // Recent ratings
  const recentRatings = await prisma.movieRating.findMany({
    where: { userId: id },
    select: { id: true, ratistRating: true, createdAt: true, movie: { select: { title: true, tmdbId: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Recent comments
  const recentComments = await prisma.comment.findMany({
    where: { userId: id },
    select: { id: true, content: true, targetType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    user,
    reportsAgainst,
    recentRatings,
    recentComments,
  });
}
