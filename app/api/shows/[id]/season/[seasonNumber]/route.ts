import { NextRequest, NextResponse } from "next/server";
import { getShowSeasonDetails } from "@/lib/tmdb";

interface Props {
  params: Promise<{ id: string; seasonNumber: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { id, seasonNumber } = await params;
    const season = await getShowSeasonDetails(Number(id), Number(seasonNumber));
    return NextResponse.json(season);
  } catch (err) {
    console.error("Season details error:", err);
    return NextResponse.json({ episodes: [] }, { status: 500 });
  }
}
