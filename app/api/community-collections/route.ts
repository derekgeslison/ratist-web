import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { getOrComputeMatchScoresBatch, CollectionItemRef } from "@/lib/collection-match";
import { getWatchedProgressBatch } from "@/lib/collection-watched";
import { maskBlockedInResponse } from "@/lib/safe-content";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
// Cap the Match tab's candidate pool so a community of 10k+ collections
// doesn't grind the prediction batch. We rank within the pool and page
// from there. The pool is sliced after the same where clause as Popular,
// so users still see the most-engaged collections at the top first.
const MATCH_CANDIDATE_LIMIT = 300;

type Tab = "admin" | "following" | "popular" | "new" | "match" | "theme" | "bookmarked";

function parseTab(raw: string | null): Tab {
  if (
    raw === "admin" || raw === "following" || raw === "popular" ||
    raw === "match" || raw === "theme" || raw === "bookmarked"
  ) return raw;
  return "new";
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  const url = new URL(req.url);
  const tab = parseTab(url.searchParams.get("tab"));

  // Featured ("admin") is the freemium funnel — accessible to anyone
  // including anonymous visitors. All other tabs require Backstage Pass.
  const isBackstage = !!user && (user.isAdmin || isSubscriptionActive(user));
  if (tab !== "admin" && !isBackstage) {
    return NextResponse.json({ error: "Community collections are a Backstage Pass feature." }, { status: 403 });
  }
  const tag = (url.searchParams.get("tag") ?? "").trim().toLowerCase();
  const search = (url.searchParams.get("search") ?? "").trim();
  const annotatedOnly = url.searchParams.get("annotated") === "true";
  const themePromptId = url.searchParams.get("themePromptId") ?? null;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const baseWhere: Prisma.CustomCollectionWhereInput = {
    visibility: "public",
    publishedAt: { not: null },
  };

  if (tab === "admin") {
    // "Featured" surfaces collections an admin explicitly flagged as
    // official Ratist curation — not every collection by an admin user.
    baseWhere.isOfficial = true;
  } else if (tab === "following") {
    const follows = await prisma.userFollow.findMany({
      where: { followerId: user!.id, status: "accepted" },
      select: { followingId: true },
    });
    if (follows.length === 0) {
      return NextResponse.json({ collections: [], hasMore: false, page });
    }
    baseWhere.userId = { in: follows.map((f) => f.followingId) };
  } else if (tab === "bookmarked") {
    // Bookmarked tab — collections the requesting user has saved. Scope
    // by user's CollectionSave rows and order by save recency.
    const saves = await prisma.collectionSave.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
      select: { collectionId: true },
    });
    if (saves.length === 0) {
      return NextResponse.json({ collections: [], hasMore: false, page });
    }
    baseWhere.id = { in: saves.map((s) => s.collectionId) };
  } else if (tab === "theme") {
    // Theme tab: collections tagged to a currently-active prompt. If a
    // specific themePromptId is passed, scope to just that one; otherwise
    // pull anything tied to any active prompt.
    if (themePromptId) {
      baseWhere.themePromptId = themePromptId;
    } else {
      const now = new Date();
      const activePrompts = await prisma.collectionPrompt.findMany({
        where: {
          AND: [
            { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
            { OR: [{ activeTo: null },   { activeTo:   { gte: now } }] },
          ],
        },
        select: { id: true },
      });
      if (activePrompts.length === 0) {
        return NextResponse.json({ collections: [], hasMore: false, page });
      }
      baseWhere.themePromptId = { in: activePrompts.map((p) => p.id) };
    }
  } else if (themePromptId) {
    // Allow non-theme tabs to optionally narrow to one prompt's responses
    // — e.g. linking to "popular collections that responded to X".
    baseWhere.themePromptId = themePromptId;
  }

  if (tag) baseWhere.tags = { some: { tag } };
  if (search) {
    // Search matches collection names OR any tag value. Tag match is
    // case-insensitive against the lowercased query so users can type
    // however they want (tags are stored lowercase already).
    baseWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tags: { some: { tag: { contains: search.toLowerCase() } } } },
    ];
  }
  // "Annotated" rewards curators who left a blurb on at least one item.
  // Postgres treats `blurb != ''` as NULL for null rows (filtered out),
  // so this single predicate excludes both null and empty blurbs.
  if (annotatedOnly) {
    baseWhere.items = { some: { blurb: { not: "" } } };
  }

  // The Match tab takes a different shape: rank-then-page rather than
  // page-then-rank. We pull the candidate pool's items, score them all
  // for this user, sort by score desc, then materialize the requested
  // page. Cap the pool to keep the prediction batch bounded.
  if (tab === "match") {
    // Exclude the user's own personal collections — Match is for
    // discovering someone else's curation. Admin-official collections
    // are conceptually authored by Ratist, so they're not "your own"
    // even when the userId column matches the viewer (admin curator).
    const candidates = await prisma.customCollection.findMany({
      where: {
        ...baseWhere,
        OR: [
          { userId: { not: user!.id } },
          { isOfficial: true },
        ],
      },
      orderBy: [{ saveCount: "desc" }, { publishedAt: "desc" }],
      take: MATCH_CANDIDATE_LIMIT,
      select: {
        id: true,
        items: { select: { tmdbId: true, mediaType: true } },
      },
    });
    if (candidates.length === 0) {
      return NextResponse.json({ collections: [], hasMore: false, page });
    }

    const candidatesWithItems = candidates.map((c) => ({
      id: c.id,
      items: c.items.map((i): CollectionItemRef => ({
        tmdbId: i.tmdbId,
        mediaType: i.mediaType === "tv" ? "tv" : "movie",
      })),
    }));
    const scoreMap = await getOrComputeMatchScoresBatch(user!.id, candidatesWithItems);

    // Sort: non-null scores descending, nulls last. Stable secondary sort
    // by saveCount (already pre-sorted by the candidates query).
    const sorted = [...candidates].sort((a, b) => {
      const sa = scoreMap.get(a.id);
      const sb = scoreMap.get(b.id);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });

    const pagedIds = sorted.slice(skip, skip + PAGE_SIZE).map((c) => c.id);
    const hasMore = sorted.length > skip + PAGE_SIZE;

    if (pagedIds.length === 0) {
      return NextResponse.json({ collections: [], hasMore: false, page });
    }
    return await renderPage(user!.id, pagedIds, scoreMap, candidatesWithItems, hasMore, page);
  }

  // Non-match tabs: page first, then enrich.
  const orderBy: Prisma.CustomCollectionOrderByWithRelationInput[] =
    tab === "popular"
      ? [{ saveCount: "desc" }, { publishedAt: "desc" }]
      : [{ publishedAt: "desc" }];

  const rows = await prisma.customCollection.findMany({
    where: baseWhere,
    orderBy,
    skip,
    take: PAGE_SIZE + 1,
    select: { id: true, items: { select: { tmdbId: true, mediaType: true } } },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const pagedIds = rows.slice(0, PAGE_SIZE).map((r) => r.id);
  if (pagedIds.length === 0) {
    return NextResponse.json({ collections: [], hasMore: false, page });
  }

  const itemsForCards = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    items: r.items.map((i): CollectionItemRef => ({
      tmdbId: i.tmdbId,
      mediaType: i.mediaType === "tv" ? "tv" : "movie",
    })),
  }));
  // Match scores + bookmark state + watched progress are viewer-specific.
  // For anonymous / non-Backstage viewers (Featured tab), skip the
  // expensive enrichment passes and return empty maps.
  const scoreMap = user
    ? await getOrComputeMatchScoresBatch(user.id, itemsForCards)
    : new Map<string, number | null>();

  return await renderPage(user?.id ?? null, pagedIds, scoreMap, itemsForCards, hasMore, page);
}

// Shared finisher: pulls full card-shape data for a list of collection
// IDs, attaches save state + match score + watched progress, and returns
// the response in the order of pagedIds. userId may be null for the
// anonymous Featured-tab path.
async function renderPage(
  userId: string | null,
  pagedIds: string[],
  scoreMap: Map<string, number | null>,
  itemsByCollection: { id: string; items: CollectionItemRef[] }[],
  hasMore: boolean,
  page: number,
) {
  const [fullRows, savedRows, watchedMap, sampleBlurbs] = await Promise.all([
    prisma.customCollection.findMany({
      where: { id: { in: pagedIds } },
      include: {
        user: { select: { id: true, name: true, firebaseUid: true, avatarUrl: true, isAdmin: true } },
        tags: { orderBy: { tag: "asc" }, select: { tag: true } },
        items: { orderBy: { sortOrder: "asc" }, take: 4, select: { posterPath: true } },
        _count: { select: { items: true } },
      },
    }),
    userId
      ? prisma.collectionSave.findMany({
          where: { userId, collectionId: { in: pagedIds } },
          select: { collectionId: true },
        })
      : Promise.resolve([] as { collectionId: string }[]),
    userId
      ? getWatchedProgressBatch(userId, itemsByCollection.filter((c) => pagedIds.includes(c.id)))
      : Promise.resolve(new Map<string, { watched: number; total: number }>()),
    // Pull one non-empty blurb per collection (the first by sortOrder)
    // so the card can preview a snippet of curatorial voice. Done as a
    // raw findMany over items rather than nested into the parent so we
    // can scope the predicate to non-empty blurbs.
    prisma.customCollectionItem.findMany({
      where: { collectionId: { in: pagedIds }, blurb: { not: "" } },
      orderBy: { sortOrder: "asc" },
      select: { collectionId: true, blurb: true, title: true },
    }),
  ]);

  const fullById = new Map(fullRows.map((r) => [r.id, r]));
  const savedIds = new Set(savedRows.map((s) => s.collectionId));

  // Take the first blurb encountered per collection (sortOrder ascending).
  const sampleBlurbByCollection = new Map<string, { blurb: string; title: string }>();
  for (const row of sampleBlurbs) {
    if (!sampleBlurbByCollection.has(row.collectionId) && row.blurb) {
      sampleBlurbByCollection.set(row.collectionId, { blurb: row.blurb, title: row.title });
    }
  }

  const collections = pagedIds
    .map((id) => fullById.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      slug: c.slug,
      mediaType: c.mediaType,
      coverPath: c.coverPath,
      saveCount: c.saveCount,
      itemCount: c._count.items,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      tags: c.tags.map((t) => t.tag),
      previewPosters: c.items.map((i) => i.posterPath).filter(Boolean) as string[],
      curator: {
        id: c.user.id,
        name: c.user.name,
        firebaseUid: c.user.firebaseUid,
        avatarUrl: c.user.avatarUrl,
        isAdmin: c.user.isAdmin,
      },
      isOfficial: c.isOfficial,
      isSaved: savedIds.has(c.id),
      matchScore: scoreMap.get(c.id) ?? null,
      watched: watchedMap.get(c.id) ?? null,
      sampleBlurb: sampleBlurbByCollection.get(c.id) ?? null,
    }));

  return NextResponse.json(await maskBlockedInResponse({ page, hasMore, collections }));
}
