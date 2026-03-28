import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const movie = await getMovieDetails(Number(id));
    return NextResponse.json({
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
      overview: movie.overview,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
