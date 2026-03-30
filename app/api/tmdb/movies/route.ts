import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

// GET /api/tmdb/movies?ids=123,456,789
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 50);

  if (ids.length === 0) return NextResponse.json({ results: [] });

  const settled = await Promise.allSettled(ids.map((id) => getMovieDetails(id)));

  const results = settled.flatMap((r, i) => {
    if (r.status === "fulfilled") {
      const m = r.value;
      return [{ id: ids[i], title: m.title, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average ?? 0 }];
    }
    return [];
  });

  return NextResponse.json({ results });
}
