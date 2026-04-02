import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

type GroupBy = "genre" | "decade" | "year" | "director" | "actor";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupBy = (req.nextUrl.searchParams.get("groupBy") ?? "genre") as GroupBy;
    const genreFilter = req.nextUrl.searchParams.get("genre") ?? "";
    const decadeFilter = req.nextUrl.searchParams.get("decade") ?? "";
    const minRating = parseFloat(req.nextUrl.searchParams.get("minRating") ?? "0");
    const maxRating = parseFloat(req.nextUrl.searchParams.get("maxRating") ?? "10");

    const ratings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      select: {
        ratistRating: true, movieId: true,
        movie: {
          select: {
            title: true, runtime: true, releaseDate: true,
            genres: { select: { genre: { select: { name: true } } } },
            cast: {
              where: { OR: [{ creditType: "cast" }, { creditType: "crew", job: "Director" }] },
              select: { creditType: true, job: true, castOrder: true, celebrity: { select: { name: true } } },
              take: 10,
            },
          },
        },
      },
    });

    // Apply filters
    let filtered = ratings;
    if (genreFilter) filtered = filtered.filter((r) => r.movie.genres.some((g) => g.genre.name === genreFilter));
    if (decadeFilter) filtered = filtered.filter((r) => {
      const y = r.movie.releaseDate?.slice(0, 3);
      return y && y + "0s" === decadeFilter;
    });
    if (minRating > 0 || maxRating < 10) {
      filtered = filtered.filter((r) => {
        const s = r.ratistRating;
        return s != null && s >= minRating && s <= maxRating;
      });
    }

    // Group
    const groups = new Map<string, { count: number; totalScore: number; ratedCount: number; totalRuntime: number }>();

    function addToGroup(key: string, rating: typeof filtered[0]) {
      const entry = groups.get(key) ?? { count: 0, totalScore: 0, ratedCount: 0, totalRuntime: 0 };
      entry.count++;
      entry.totalRuntime += rating.movie.runtime ?? 0;
      if (rating.ratistRating != null) { entry.totalScore += rating.ratistRating; entry.ratedCount++; }
      groups.set(key, entry);
    }

    for (const r of filtered) {
      switch (groupBy) {
        case "genre":
          for (const g of r.movie.genres) addToGroup(g.genre.name, r);
          break;
        case "decade": {
          const y = r.movie.releaseDate?.slice(0, 3);
          if (y) addToGroup(y + "0s", r);
          break;
        }
        case "year": {
          const y = r.movie.releaseDate?.slice(0, 4);
          if (y) addToGroup(y, r);
          break;
        }
        case "director": {
          const dirs = r.movie.cast.filter((c) => c.creditType === "crew" && c.job === "Director");
          for (const d of dirs) addToGroup(d.celebrity.name, r);
          break;
        }
        case "actor": {
          const acts = r.movie.cast.filter((c) => c.creditType === "cast").slice(0, 5);
          for (const a of acts) addToGroup(a.celebrity.name, r);
          break;
        }
      }
    }

    const rows = [...groups.entries()].map(([label, d]) => ({
      label,
      count: d.count,
      avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null,
      totalHours: Math.round(d.totalRuntime / 60),
    }));

    // Default sort by count desc
    rows.sort((a, b) => b.count - a.count);

    return NextResponse.json({ rows, totalFiltered: filtered.length });
  } catch (err) {
    console.error("Analytics report error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
