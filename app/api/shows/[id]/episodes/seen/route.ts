import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getShowDetails, getShowSeasonDetails } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, autoDateOnSeen: true } });
  } catch {
    return null;
  }
}

/** Cache season + episode metadata from TMDB into the DB (fire-and-forget) */
async function cacheSeasonEpisodes(tvShowId: string, _showTmdbId: number, seasonNumber: number, tmdbEpisodes: { episode_number: number; name?: string | null; overview?: string | null; still_path?: string | null; air_date?: string | null; runtime?: number | null; vote_average?: number | null; vote_count?: number | null; id: number }[]) {
  try {
    // Upsert the season
    const season = await prisma.tVSeason.upsert({
      where: { tvShowId_seasonNumber: { tvShowId, seasonNumber } },
      create: { tvShowId, tmdbId: 0, seasonNumber, episodeCount: tmdbEpisodes.length },
      update: { episodeCount: tmdbEpisodes.length },
    });
    // Upsert episodes
    for (const ep of tmdbEpisodes) {
      await prisma.tVEpisode.upsert({
        where: { seasonId_episodeNumber: { seasonId: season.id, episodeNumber: ep.episode_number } },
        create: {
          seasonId: season.id,
          tmdbId: ep.id,
          episodeNumber: ep.episode_number,
          name: ep.name ?? null,
          overview: ep.overview ?? null,
          stillPath: ep.still_path ?? null,
          airDate: ep.air_date ?? null,
          runtime: ep.runtime ?? null,
          voteAverage: ep.vote_average ?? null,
          voteCount: ep.vote_count ?? null,
        },
        update: {
          name: ep.name ?? null,
          overview: ep.overview ?? null,
        },
      });
    }
  } catch { /* non-critical — just for name lookup */ }
}

// GET: return all seen episodes for this show
export async function GET(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ episodes: [] });

  const { id } = await params;
  const showTmdbId = Number(id);

  const episodes = await prisma.episodeSeen.findMany({
    where: { userId: user.id, showTmdbId },
    select: { seasonNumber: true, episodeNumber: true, watchedDate: true },
    orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
  });

  return NextResponse.json({ episodes });
}

// POST: bulk mark/unmark episodes
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const showTmdbId = Number(id);
    const body = await req.json();
    const { mode, episodes, seasonNumber, action = "add" } = body;
    // Respect autoDateOnSeen preference: only auto-set date if user opted in
    const watchedDate = body.watchedDate ?? (user.autoDateOnSeen ? new Date().toISOString() : null);

    // Ensure show exists in DB
    const tvShow = await prisma.tVShow.upsert({
      where: { tmdbId: showTmdbId },
      create: { tmdbId: showTmdbId, name: body.showName ?? "Unknown", posterPath: body.posterPath ?? null },
      update: {},
    });

    if (mode === "series") {
      // Mark entire series: fetch all seasons from TMDB, collect all episodes
      const show = await getShowDetails(showTmdbId);
      const regularSeasons = (show.seasons ?? []).filter((s) => s.season_number > 0);

      const allEpisodes: { seasonNumber: number; episodeNumber: number }[] = [];
      // Batch TMDB calls in groups of 5 to respect rate limits
      for (let i = 0; i < regularSeasons.length; i += 5) {
        const batch = regularSeasons.slice(i, i + 5);
        const seasonDetails = await Promise.all(
          batch.map((s) => getShowSeasonDetails(showTmdbId, s.season_number).catch(() => null))
        );
        for (const sd of seasonDetails) {
          if (!sd?.episodes) continue;
          for (const ep of sd.episodes) {
            allEpisodes.push({ seasonNumber: ep.season_number, episodeNumber: ep.episode_number });
          }
          // Cache episode names to DB (fire-and-forget)
          cacheSeasonEpisodes(tvShow.id, showTmdbId, sd.episodes[0]?.season_number ?? 0, sd.episodes).catch(() => {});
        }
      }

      if (action === "remove") {
        await prisma.episodeSeen.deleteMany({ where: { userId: user.id, showTmdbId } });
      } else {
        await prisma.episodeSeen.createMany({
          data: allEpisodes.map((ep) => ({
            userId: user.id,
            showTmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            watchedDate: watchedDate ? new Date(watchedDate) : null,
          })),
          skipDuplicates: true,
        });
        // Also set show-level seen
        await prisma.userFavoriteShow.upsert({
          where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
          create: { userId: user.id, tvShowId: tvShow.id },
          update: {},
        });
      }
    } else if (mode === "season" && seasonNumber != null) {
      // Mark/unmark entire season
      const seasonDetail = await getShowSeasonDetails(showTmdbId, seasonNumber).catch(() => null);
      if (!seasonDetail?.episodes) return NextResponse.json({ error: "Season not found" }, { status: 404 });

      // Cache episode names to DB (fire-and-forget)
      cacheSeasonEpisodes(tvShow.id, showTmdbId, seasonNumber, seasonDetail.episodes).catch(() => {});

      const seasonEpisodes = seasonDetail.episodes.map((ep) => ({
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
      }));

      if (action === "remove") {
        await prisma.episodeSeen.deleteMany({
          where: { userId: user.id, showTmdbId, seasonNumber },
        });
      } else {
        await prisma.episodeSeen.createMany({
          data: seasonEpisodes.map((ep) => ({
            userId: user.id,
            showTmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            watchedDate: watchedDate ? new Date(watchedDate) : null,
          })),
          skipDuplicates: true,
        });
      }
    } else if (mode === "episodes" && Array.isArray(episodes)) {
      // Bulk add/remove specific episodes
      if (action === "remove") {
        for (const ep of episodes) {
          await prisma.episodeSeen.deleteMany({
            where: { userId: user.id, showTmdbId, seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber },
          });
        }
      } else {
        await prisma.episodeSeen.createMany({
          data: episodes.map((ep: { seasonNumber: number; episodeNumber: number }) => ({
            userId: user.id,
            showTmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            watchedDate: watchedDate ? new Date(watchedDate) : null,
          })),
          skipDuplicates: true,
        });
      }
    } else {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    // Check remaining episode count and sync show-level seen
    const remainingCount = await prisma.episodeSeen.count({ where: { userId: user.id, showTmdbId } });
    if (remainingCount === 0 && mode !== "series") {
      // No episodes left — remove show-level seen
      await prisma.userFavoriteShow.deleteMany({
        where: { userId: user.id, tvShowId: tvShow.id },
      });
    } else if (remainingCount > 0 && action !== "remove") {
      // Has episodes — ensure show-level seen is set
      await prisma.userFavoriteShow.upsert({
        where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
        create: { userId: user.id, tvShowId: tvShow.id },
        update: {},
      });
    }

    // Return updated seen episodes
    const seenEpisodes = await prisma.episodeSeen.findMany({
      where: { userId: user.id, showTmdbId },
      select: { seasonNumber: true, episodeNumber: true },
      orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    });

    return NextResponse.json({
      episodes: seenEpisodes,
      showSeen: remainingCount > 0,
      totalEpisodesSeen: remainingCount,
    });
  } catch (err) {
    console.error("Episode seen error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH: update watched dates for episodes
export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const showTmdbId = Number(id);
    const body = await req.json();
    const { episodes, watchedDate } = body;
    // episodes: optional array of {seasonNumber, episodeNumber} to update specific ones
    // if omitted, updates ALL episodes for this show with the given date
    const newDate = watchedDate ? new Date(watchedDate) : null;

    if (Array.isArray(episodes) && episodes.length > 0) {
      // Update specific episodes
      for (const ep of episodes) {
        await prisma.episodeSeen.updateMany({
          where: { userId: user.id, showTmdbId, seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber },
          data: { watchedDate: newDate },
        });
      }
    } else {
      // Update all episodes for this show
      await prisma.episodeSeen.updateMany({
        where: { userId: user.id, showTmdbId },
        data: { watchedDate: newDate },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Episode date update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
