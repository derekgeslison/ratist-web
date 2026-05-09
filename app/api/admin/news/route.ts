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
    // Sort by content date (publishedAt) so trailers slot in by their
    // YouTube upload date — not the moment the cron happened to pull
    // them in. Drafts (publishedAt null) fall to the bottom and break
    // ties on createdAt.
    orderBy: [
      { publishedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    select: {
      id: true, type: true, title: true, slug: true,
      published: true, publishedAt: true, createdAt: true, updatedAt: true,
      viewCount: true, coverImage: true, posterPath: true,
      movieTmdbId: true, showTmdbId: true, youtubeKey: true,
      sourceUrl: true, sourceName: true,
      author: { select: { name: true } },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
    },
  });

  return NextResponse.json({ items });
}

/** POST — create news item (EDITORIAL or TRAILER) */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      type = "EDITORIAL",
      title, content, excerpt, coverImage,
      published = false, publishedAt: publishedAtRaw, showAuthor,
      movieTmdbId, showTmdbId, posterPath,
      sourceUrl, sourceName, youtubeKey,
      rssHeadlineId,
      media: mediaItems = [],
      people: peopleItems = [],
    } = body;

    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (type !== "EDITORIAL" && type !== "TRAILER") return NextResponse.json({ error: "invalid type" }, { status: 400 });

    // Resolve the go-live timestamp on create. Match the posts route:
    // publishing without a date means now(); a provided ISO string is
    // honored (lets admins schedule from the new-news form).
    let publishedAt: Date | null = null;
    if (published) {
      if (typeof publishedAtRaw === "string" && publishedAtRaw.length > 0) {
        const parsed = new Date(publishedAtRaw);
        publishedAt = isNaN(parsed.getTime()) ? new Date() : parsed;
      } else {
        publishedAt = new Date();
      }
    }

    const slug = await uniqueSlug(slugify(title));
    const item = await prisma.newsItem.create({
      data: {
        type,
        authorId: user.id,
        title,
        slug,
        content: content ?? null,
        excerpt: excerpt ?? null,
        coverImage: coverImage ?? null,
        published,
        publishedAt,
        ...(showAuthor !== undefined && { showAuthor }),
        movieTmdbId: movieTmdbId ? Number(movieTmdbId) : null,
        showTmdbId: showTmdbId ? Number(showTmdbId) : null,
        posterPath: posterPath ?? null,
        sourceUrl: sourceUrl ?? null,
        sourceName: sourceName ?? null,
        youtubeKey: youtubeKey ?? null,
      },
    });

    // Media links
    for (const m of Array.isArray(mediaItems) ? mediaItems : []) {
      if (!m.tmdbId || !m.mediaType || !m.title) continue;
      let movieId: string | null = null;
      let tvShowId: string | null = null;
      if (m.mediaType === "movie") {
        const movie = await prisma.movie.findUnique({ where: { tmdbId: m.tmdbId }, select: { id: true } });
        movieId = movie?.id ?? null;
      } else if (m.mediaType === "tv") {
        const show = await prisma.tVShow.findUnique({ where: { tmdbId: m.tmdbId }, select: { id: true } });
        tvShowId = show?.id ?? null;
      }
      await prisma.newsItemMedia.create({
        data: {
          newsItemId: item.id,
          tmdbId: m.tmdbId,
          mediaType: m.mediaType,
          title: m.title,
          posterPath: m.posterPath ?? null,
          movieId,
          tvShowId,
        },
      });
    }

    // People links
    for (const p of Array.isArray(peopleItems) ? peopleItems : []) {
      if (!p.tmdbId || !p.name) continue;
      const celeb = await prisma.celebrity.findUnique({ where: { tmdbId: p.tmdbId }, select: { id: true } });
      await prisma.newsItemPerson.create({
        data: {
          newsItemId: item.id,
          tmdbId: p.tmdbId,
          name: p.name,
          profilePath: p.profilePath ?? null,
          celebrityId: celeb?.id ?? null,
        },
      });
    }

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
