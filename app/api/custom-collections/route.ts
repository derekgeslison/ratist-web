import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { postingBlockResponse } from "@/lib/posting-block";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ collections: [] });

  // Personal collections list — explicitly excludes the user's
  // admin-curated "Ratist" collections so those don't pollute the
  // personal surface. Admin official collections live on /admin/collections.
  const visibility = new URL(req.url).searchParams.get("visibility");
  const where = visibility === "public"
    ? { userId: user.id, visibility: "public" as const, isOfficial: false }
    : { userId: user.id, isOfficial: false };

  const collections = await prisma.customCollection.findMany({
    where,
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        take: 4, // preview posters only
        // tmdbId + mediaType lets us check the per-title block flag
        // when building previewPosters so blocked posters don't slip
        // through the cover-strip on the collections list.
        select: { posterPath: true, tmdbId: true, mediaType: true },
      },
      // Theme info is exposed so theme-reassign UIs can warn the user
      // before overwriting an existing tag.
      themePrompt: { select: { id: true, title: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Look up per-title posterBlocked flags so the preview-poster
  // strip on the collections list doesn't render explicit imagery.
  const previewTmdbIds = collections.flatMap((c) => c.items.map((i) => i.tmdbId));
  const [blockedMovies, blockedShows] = previewTmdbIds.length > 0
    ? await Promise.all([
        prisma.movie.findMany({ where: { tmdbId: { in: previewTmdbIds }, posterBlocked: true }, select: { tmdbId: true } }),
        prisma.tVShow.findMany({ where: { tmdbId: { in: previewTmdbIds }, posterBlocked: true }, select: { tmdbId: true } }),
      ])
    : [[], []];
  const blockedSet = new Set<number>([
    ...blockedMovies.map((m) => m.tmdbId),
    ...blockedShows.map((s) => s.tmdbId),
  ]);

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      prompt: c.prompt,
      mediaType: c.mediaType,
      visibility: c.visibility,
      slug: c.slug,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      themePromptId: c.themePromptId,
      themePromptTitle: c.themePrompt?.title ?? null,
      saveCount: c.saveCount,
      itemCount: c._count.items,
      previewPosters: c.items
        .map((i) => (blockedSet.has(i.tmdbId) ? "__BLOCKED__" : i.posterPath))
        .filter(Boolean),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

interface IncomingItem {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json({ error: "Custom collections are a Backstage Pass feature." }, { status: 403 });
  }

  const blockResp = await postingBlockResponse(user.id);
  if (blockResp) return blockResp;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  const mediaType = body?.mediaType === "tv" || body?.mediaType === "any" ? body.mediaType : "movie";
  const items = Array.isArray(body?.items) ? body.items as IncomingItem[] : [];
  // Optional response to an admin-authored prompt. Validate the prompt
  // exists before linking — null is the unset case.
  const themePromptId = typeof body?.themePromptId === "string" && body.themePromptId.length > 0 ? body.themePromptId : null;
  if (themePromptId) {
    const exists = await prisma.collectionPrompt.findUnique({ where: { id: themePromptId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Theme prompt not found." }, { status: 400 });
  }
  // Admin-only: stamp the collection as official at creation so it gets
  // routed to /admin/collections immediately rather than briefly
  // appearing in the admin's personal list while the publish step runs.
  const isOfficial = user.isAdmin && body?.isOfficial === true;
  // Curator-controlled: numbered watch order display.
  const numberedOrder = body?.numberedOrder === true;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "Collection must have at least one item" }, { status: 400 });
  if (items.length > 50) return NextResponse.json({ error: "Too many items (max 50)" }, { status: 400 });

  const valid = items.filter((i) =>
    (i.mediaType === "movie" || i.mediaType === "tv") &&
    typeof i.tmdbId === "number" &&
    typeof i.title === "string" && i.title.length > 0
  );
  if (valid.length === 0) return NextResponse.json({ error: "No valid items" }, { status: 400 });

  const created = await prisma.customCollection.create({
    data: {
      userId: user.id,
      name,
      description: description || null,
      prompt,
      mediaType,
      themePromptId,
      isOfficial,
      numberedOrder,
      items: {
        create: valid.map((i, idx) => ({
          mediaType: i.mediaType,
          tmdbId: i.tmdbId,
          title: i.title.slice(0, 500),
          posterPath: i.posterPath ?? null,
          releaseDate: i.releaseDate ?? null,
          voteAverage: typeof i.voteAverage === "number" ? i.voteAverage : null,
          sortOrder: idx,
        })),
      },
    },
    select: { id: true, name: true },
  });

  return NextResponse.json({ collection: created });
}
