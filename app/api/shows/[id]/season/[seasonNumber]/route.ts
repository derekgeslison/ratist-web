import { NextRequest, NextResponse } from "next/server";
import { getShowSeasonDetails } from "@/lib/tmdb";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string; seasonNumber: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { id, seasonNumber } = await params;
    const season = await getShowSeasonDetails(Number(id), Number(seasonNumber));

    // Cache episode names to DB (fire-and-forget)
    if (season?.episodes?.length) {
      prisma.tVShow.findUnique({ where: { tmdbId: Number(id) }, select: { id: true } })
        .then((show) => {
          if (!show) return;
          return prisma.tVSeason.upsert({
            where: { tvShowId_seasonNumber: { tvShowId: show.id, seasonNumber: Number(seasonNumber) } },
            create: { tvShowId: show.id, tmdbId: season.id ?? 0, seasonNumber: Number(seasonNumber), episodeCount: season.episodes?.length ?? 0 },
            update: { episodeCount: season.episodes?.length ?? 0 },
          }).then((dbSeason) => {
            const ops = (season.episodes ?? []).map((ep: { episode_number: number; name?: string; id: number }) =>
              prisma.tVEpisode.upsert({
                where: { seasonId_episodeNumber: { seasonId: dbSeason.id, episodeNumber: ep.episode_number } },
                create: { seasonId: dbSeason.id, tmdbId: ep.id, episodeNumber: ep.episode_number, name: ep.name ?? null },
                update: { name: ep.name ?? null },
              })
            );
            return Promise.all(ops);
          });
        })
        .catch(() => {});
    }

    return NextResponse.json(season);
  } catch (err) {
    console.error("Season details error:", err);
    return NextResponse.json({ episodes: [] }, { status: 500 });
  }
}
