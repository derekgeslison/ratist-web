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

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersDay,
    newUsersWeek,
    newUsersMonth,
    totalRatings,
    newRatingsDay,
    newRatingsWeek,
    totalMovies,
    totalSeenEntries,
    publishedPosts,
    totalReviews,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.movieRating.count(),
    prisma.movieRating.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.movieRating.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.movie.count(),
    prisma.userFavoriteMovie.count(),
    prisma.blogPost.count({ where: { published: true } }),
    prisma.movieRating.count({ where: { reviewText: { not: null } } }),
  ]);

  return NextResponse.json({
    users: { total: totalUsers, day: newUsersDay, week: newUsersWeek, month: newUsersMonth },
    ratings: { total: totalRatings, day: newRatingsDay, week: newRatingsWeek, reviews: totalReviews },
    movies: { total: totalMovies },
    seenEntries: totalSeenEntries,
    publishedPosts,
  });
}
