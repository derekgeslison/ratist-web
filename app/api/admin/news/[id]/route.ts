import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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

interface Props {
  params: Promise<{ id: string }>;
}

/** GET — single news item */
export async function GET(req: NextRequest, { params }: Props) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const item = await prisma.newsItem.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

/** PUT — update news item */
export async function PUT(req: NextRequest, { params }: Props) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const {
      title, content, excerpt, coverImage,
      published, publishedAt: publishedAtRaw, showAuthor, movieTmdbId, showTmdbId, posterPath,
      sourceUrl, sourceName, youtubeKey,
      media: mediaItems,
      people: peopleItems,
    } = body;

    const existing = await prisma.newsItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Resolve the go-live timestamp. Three valid combos mirror the
    // posts route: published=true + ISO string → schedule / pin to a
    // specific date; published=true + omitted → publish now (or leave
    // existing date alone for already-published items); published=false
    // → clear publishedAt.
    let publishedAt = existing.publishedAt;
    if (published === true) {
      if (typeof publishedAtRaw === "string" && publishedAtRaw.length > 0) {
        const parsed = new Date(publishedAtRaw);
        publishedAt = isNaN(parsed.getTime()) ? (existing.publishedAt ?? new Date()) : parsed;
      } else if (!existing.publishedAt) {
        publishedAt = new Date();
      }
    } else if (published === false) {
      publishedAt = null;
    } else if (typeof publishedAtRaw === "string" && publishedAtRaw.length > 0) {
      // Reschedule without flipping status.
      const parsed = new Date(publishedAtRaw);
      if (!isNaN(parsed.getTime())) publishedAt = parsed;
    }

    // Regen slug if title changed
    let slug = existing.slug;
    if (title && title !== existing.title) {
      slug = await uniqueSlug(slugify(title), id);
    }

    const item = await prisma.newsItem.update({
      where: { id },
      data: {
        ...(title !== undefined && { title, slug }),
        ...(content !== undefined && { content }),
        ...(excerpt !== undefined && { excerpt }),
        ...(coverImage !== undefined && { coverImage }),
        ...(published !== undefined && { published, publishedAt }),
        ...(showAuthor !== undefined && { showAuthor }),
        ...(movieTmdbId !== undefined && { movieTmdbId: movieTmdbId ? Number(movieTmdbId) : null }),
        ...(showTmdbId !== undefined && { showTmdbId: showTmdbId ? Number(showTmdbId) : null }),
        ...(posterPath !== undefined && { posterPath }),
        ...(sourceUrl !== undefined && { sourceUrl }),
        ...(sourceName !== undefined && { sourceName }),
        ...(youtubeKey !== undefined && { youtubeKey }),
      },
    });

    // Replace media links if provided
    if (Array.isArray(mediaItems)) {
      await prisma.newsItemMedia.deleteMany({ where: { newsItemId: id } });
      for (const m of mediaItems) {
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
            newsItemId: id,
            tmdbId: m.tmdbId,
            mediaType: m.mediaType,
            title: m.title,
            posterPath: m.posterPath ?? null,
            movieId,
            tvShowId,
          },
        });
      }
    }

    // Replace people links if provided
    if (Array.isArray(peopleItems)) {
      await prisma.newsItemPerson.deleteMany({ where: { newsItemId: id } });
      for (const p of peopleItems) {
        if (!p.tmdbId || !p.name) continue;
        const celeb = await prisma.celebrity.findUnique({ where: { tmdbId: p.tmdbId }, select: { id: true } });
        await prisma.newsItemPerson.create({
          data: {
            newsItemId: id,
            tmdbId: p.tmdbId,
            name: p.name,
            profilePath: p.profilePath ?? null,
            celebrityId: celeb?.id ?? null,
          },
        });
      }
    }

    return NextResponse.json({ item });
  } catch (err) {
    console.error("Update news item error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — delete news item */
export async function DELETE(req: NextRequest, { params }: Props) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.newsItem.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ deleted: true });
}
