import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import type { NewsItemType } from "@prisma/client";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base;
  let n = 0;
  while (true) {
    const existing = await prisma.newsItem.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

/** GET — list news items */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as NewsItemType | null;

  const items = await prisma.newsItem.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, title: true, slug: true,
      published: true, publishedAt: true, createdAt: true, updatedAt: true,
      viewCount: true, coverImage: true, posterPath: true,
      movieTmdbId: true, showTmdbId: true, youtubeKey: true,
      sourceUrl: true, sourceName: true,
      author: { select: { name: true } },
    },
  });

  return NextResponse.json({ items });
}

/** POST — create editorial news item */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      title, content, excerpt, coverImage,
      published = false,
      movieTmdbId, showTmdbId, posterPath,
      sourceUrl, sourceName, youtubeKey,
      rssHeadlineId,
    } = body;

    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const slug = await uniqueSlug(slugify(title));
    const item = await prisma.newsItem.create({
      data: {
        type: "EDITORIAL",
        authorId: user.id,
        title,
        slug,
        content: content ?? null,
        excerpt: excerpt ?? null,
        coverImage: coverImage ?? null,
        published,
        publishedAt: published ? new Date() : null,
        movieTmdbId: movieTmdbId ? Number(movieTmdbId) : null,
        showTmdbId: showTmdbId ? Number(showTmdbId) : null,
        posterPath: posterPath ?? null,
        sourceUrl: sourceUrl ?? null,
        sourceName: sourceName ?? null,
        youtubeKey: youtubeKey ?? null,
      },
    });

    // If created from an RSS headline, mark it as used
    if (rssHeadlineId) {
      await prisma.rssHeadline.update({
        where: { id: rssHeadlineId },
        data: { usedInPost: item.id },
      }).catch(() => {});
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("Create news item error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
