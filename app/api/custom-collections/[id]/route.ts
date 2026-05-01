import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { invalidateCollectionMatchCache } from "@/lib/collection-match";

export const dynamic = "force-dynamic";

interface IncomingItem {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  blurb?: string | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await prisma.customCollection.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      tags:  { orderBy: { tag: "asc" } },
      themePrompt: { select: { id: true, title: true } },
    },
  });
  if (!c || c.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    collection: {
      id: c.id,
      name: c.name,
      description: c.description,
      prompt: c.prompt,
      mediaType: c.mediaType,
      visibility: c.visibility,
      slug: c.slug,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      coverPath: c.coverPath,
      themePromptId: c.themePromptId,
      themePrompt: c.themePrompt ? { id: c.themePrompt.id, title: c.themePrompt.title } : null,
      isOfficial: c.isOfficial,
      saveCount: c.saveCount,
      viewCount: c.viewCount,
      createdAt: c.createdAt.toISOString(),
      tags: c.tags.map((t) => t.tag),
      items: c.items.map((i) => ({
        id: i.id,
        mediaType: i.mediaType,
        tmdbId: i.tmdbId,
        title: i.title,
        posterPath: i.posterPath,
        releaseDate: i.releaseDate,
        voteAverage: i.voteAverage,
        sortOrder: i.sortOrder,
        blurb: i.blurb,
      })),
    },
  });
}

// PATCH: edit metadata, items, tags, or step visibility down to private.
// Promoting from private → public is not allowed here — the curator
// must go through POST /publish (rate-limited + 5-item minimum).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.customCollection.findUnique({
    where: { id },
    select: { userId: true, visibility: true },
  });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (typeof body.description === "string" || body.description === null) {
    data.description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
  }
  if (typeof body.coverPath === "string" || body.coverPath === null) {
    data.coverPath = typeof body.coverPath === "string" ? body.coverPath.slice(0, 200) || null : null;
  }
  if (typeof body.visibility === "string") {
    if (body.visibility === "private") {
      data.visibility = "private";
    } else if (body.visibility === existing.visibility) {
      // No-op transition; allowed.
    } else {
      return NextResponse.json(
        { error: "Use the publish endpoint to make a collection public." },
        { status: 400 },
      );
    }
  }

  // Theme prompt link — null clears, string sets, undefined leaves alone.
  if (body.themePromptId === null) {
    data.themePromptId = null;
  } else if (typeof body.themePromptId === "string" && body.themePromptId.length > 0) {
    const exists = await prisma.collectionPrompt.findUnique({ where: { id: body.themePromptId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Theme prompt not found." }, { status: 400 });
    data.themePromptId = body.themePromptId;
  }

  // Admin-only: flip the official flag. Silently ignored for non-admins
  // so a curated UI accidentally sending the field can't escalate.
  if (typeof body.isOfficial === "boolean" && user.isAdmin) {
    data.isOfficial = body.isOfficial;
  }

  // Items: full replace when present.
  const items = Array.isArray(body.items) ? (body.items as IncomingItem[]) : null;
  if (items) {
    if (items.length === 0) return NextResponse.json({ error: "Collection must have at least one item" }, { status: 400 });
    if (items.length > 50) return NextResponse.json({ error: "Too many items (max 50)" }, { status: 400 });
    const valid = items.filter((i) =>
      (i.mediaType === "movie" || i.mediaType === "tv") &&
      typeof i.tmdbId === "number" &&
      typeof i.title === "string" && i.title.length > 0
    );
    if (valid.length === 0) return NextResponse.json({ error: "No valid items" }, { status: 400 });

    await prisma.$transaction([
      prisma.customCollectionItem.deleteMany({ where: { collectionId: id } }),
      prisma.customCollectionItem.createMany({
        data: valid.map((i, idx) => ({
          collectionId: id,
          mediaType: i.mediaType,
          tmdbId: i.tmdbId,
          title: i.title.slice(0, 500),
          posterPath: i.posterPath ?? null,
          releaseDate: i.releaseDate ?? null,
          voteAverage: typeof i.voteAverage === "number" ? i.voteAverage : null,
          sortOrder: idx,
          blurb: typeof i.blurb === "string" ? i.blurb.trim().slice(0, 280) || null : null,
        })),
      }),
    ]);
  }

  // Tags: full replace when present (mirrors forum tag pattern).
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]) : null;
  if (tags) {
    const cleaned = Array.from(new Set(
      tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter((t) => t.length > 0 && t.length <= 30),
    )).slice(0, 10);
    await prisma.$transaction([
      prisma.collectionTag.deleteMany({ where: { collectionId: id } }),
      ...(cleaned.length > 0
        ? [prisma.collectionTag.createMany({
            data: cleaned.map((tag) => ({ collectionId: id, tag })),
          })]
        : []),
    ]);
  }

  if (Object.keys(data).length > 0) {
    await prisma.customCollection.update({ where: { id }, data });
  }

  // Item changes shift the prediction outcome; visibility flips affect
  // who can see the collection in the feed (and saving null caches for
  // unreachable collections is wasteful). Either way: wipe the cache.
  if (items || data.visibility != null) {
    await invalidateCollectionMatchCache(id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.customCollection.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.customCollection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
