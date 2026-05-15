import { NextRequest, NextResponse } from "next/server";
import { getShowDetails } from "@/lib/tmdb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const show = await getShowDetails(Number(id));
    return NextResponse.json({
      id: show.id,
      name: show.name,
      poster_path: show.poster_path,
      first_air_date: show.first_air_date,
      vote_average: show.vote_average ?? 0,
      overview: show.overview,
      number_of_seasons: show.number_of_seasons,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
