import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import {
  getOrComputeMatchScoresBatch,
  predictRatingsBatch,
  CollectionItemRef,
} from "@/lib/collection-match";
import { getWatchedProgress } from "@/lib/collection-watched";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string; slug: string }> },
) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json({ error: "Community collections are a Backstage Pass feature." }, { status: 403 });
  }

  const { uid, slug } = await params;

  // Look up the curator by firebaseUid (the public URL identifier used
  // across the site for /profile/[uid]).
  const curator = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    select: { id: true, name: true, firebaseUid: true, avatarUrl: true, isAdmin: true, bio: true },
  });
  if (!curator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const collection = await prisma.customCollection.findFirst({
    where: {
      userId: curator.id,
      slug,
      visibility: "public",
      publishedAt: { not: null },
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      tags:  { orderBy: { tag: "asc" }, select: { tag: true } },
      themePrompt: { select: { id: true, title: true } },
    },
  });
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const itemRefs: CollectionItemRef[] = collection.items.map((i) => ({
    tmdbId: i.tmdbId,
    mediaType: i.mediaType === "tv" ? "tv" : "movie",
  }));

  const movieTmdbIds = collection.items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const tvTmdbIds    = collection.items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);

  // Resolve the curator's per-item ratistRating + the viewer's predicted
  // rating for each item, plus the overall match + watched progress, all
  // in parallel. Curator ratings come from the same component-rated
  // tables used elsewhere on the site; series-scope only on TV so per-
  // season ratings don't override the curator's headline opinion.
  const [save, curatorMovieRatings, curatorTvRatings, predictions, scoreMap, watched, movieRows, showRows] = await Promise.all([
    prisma.collectionSave.findUnique({
      where: { userId_collectionId: { userId: user.id, collectionId: collection.id } },
      select: { userId: true },
    }),
    movieTmdbIds.length > 0
      ? prisma.movieRating.findMany({
          where: {
            userId: curator.id,
            excluded: false,
            ratistRating: { not: null },
            movie: { tmdbId: { in: movieTmdbIds } },
          },
          select: { ratistRating: true, movie: { select: { tmdbId: true } } },
        })
      : Promise.resolve([]),
    tvTmdbIds.length > 0
      ? prisma.tVShowRating.findMany({
          where: {
            userId: curator.id,
            excluded: false,
            ratingScope: "series",
            ratistRating: { not: null },
            tvShow: { tmdbId: { in: tvTmdbIds } },
          },
          select: { ratistRating: true, tvShow: { select: { tmdbId: true } } },
        })
      : Promise.resolve([]),
    predictRatingsBatch(user.id, itemRefs),
    getOrComputeMatchScoresBatch(user.id, [{ id: collection.id, items: itemRefs }]),
    getWatchedProgress(user.id, {
      id: collection.id,
      items: itemRefs,
    }),
    movieTmdbIds.length > 0
      ? prisma.movie.findMany({
          where: { tmdbId: { in: movieTmdbIds } },
          select: { id: true, tmdbId: true },
        })
      : Promise.resolve([]),
    tvTmdbIds.length > 0
      ? prisma.tVShow.findMany({
          where: { tmdbId: { in: tvTmdbIds } },
          select: { id: true, tmdbId: true },
        })
      : Promise.resolve([]),
  ]);

  // Build TMDB-keyed lookup maps. The curator-rating queries already
  // joined movie/tvShow so we can key by tmdbId without extra resolution;
  // movieRows/showRows are kept for the watched-progress side which uses
  // internal IDs, but they're already resolved by the helper.
  void movieRows; void showRows;
  const curatorMovieRating = new Map(curatorMovieRatings.map((r) => [r.movie.tmdbId, r.ratistRating]));
  const curatorTvRating    = new Map(curatorTvRatings.map((r) => [r.tvShow.tmdbId, r.ratistRating]));

  // Fire-and-forget view increment. Owner views don't inflate the count.
  if (collection.userId !== user.id) {
    prisma.customCollection
      .update({ where: { id: collection.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => { /* non-critical */ });
  }

  return NextResponse.json({
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      slug: collection.slug,
      mediaType: collection.mediaType,
      coverPath: collection.coverPath,
      saveCount: collection.saveCount,
      viewCount: collection.viewCount,
      publishedAt: collection.publishedAt?.toISOString() ?? null,
      createdAt: collection.createdAt.toISOString(),
      tags: collection.tags.map((t) => t.tag),
      isOfficial: collection.isOfficial,
      themePromptId: collection.themePromptId,
      themePrompt: collection.themePrompt ? { id: collection.themePrompt.id, title: collection.themePrompt.title } : null,
      matchScore: scoreMap.get(collection.id) ?? null,
      watched,
      items: collection.items.map((i) => {
        const key = `${i.mediaType === "tv" ? "tv" : "movie"}-${i.tmdbId}`;
        const curatorRating = i.mediaType === "tv"
          ? curatorTvRating.get(i.tmdbId) ?? null
          : curatorMovieRating.get(i.tmdbId) ?? null;
        return {
          id: i.id,
          mediaType: i.mediaType,
          tmdbId: i.tmdbId,
          title: i.title,
          posterPath: i.posterPath,
          releaseDate: i.releaseDate,
          voteAverage: i.voteAverage,
          sortOrder: i.sortOrder,
          blurb: i.blurb,
          curatorRating,
          predictedRating: predictions.get(key) ?? null,
        };
      }),
      curator: {
        id: curator.id,
        name: curator.name,
        firebaseUid: curator.firebaseUid,
        avatarUrl: curator.avatarUrl,
        isAdmin: curator.isAdmin,
        bio: curator.bio,
      },
      isOwner: collection.userId === user.id,
      isSaved: !!save,
    },
  });
}
