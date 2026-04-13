import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ id: string }> }

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(req: NextRequest, { params }: Props) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: {
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PUT(req: NextRequest, { params }: Props) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const { title, content, excerpt, coverImage, published, showAuthor, media: mediaItems, people: peopleItems } = body;

  const post = await prisma.blogPost.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(excerpt !== undefined && { excerpt }),
      ...(coverImage !== undefined && { coverImage }),
      ...(published !== undefined && { published }),
      ...(showAuthor !== undefined && { showAuthor }),
    },
  });

  // Replace media links if provided
  if (Array.isArray(mediaItems)) {
    await prisma.blogPostMedia.deleteMany({ where: { postId: id } });
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
      await prisma.blogPostMedia.create({
        data: {
          postId: id,
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
    await prisma.blogPostPerson.deleteMany({ where: { postId: id } });
    for (const p of peopleItems) {
      if (!p.tmdbId || !p.name) continue;
      const celeb = await prisma.celebrity.findUnique({ where: { tmdbId: p.tmdbId }, select: { id: true } });
      await prisma.blogPostPerson.create({
        data: {
          postId: id,
          tmdbId: p.tmdbId,
          name: p.name,
          profilePath: p.profilePath ?? null,
          celebrityId: celeb?.id ?? null,
        },
      });
    }
  }

  return NextResponse.json({ post });
}

export async function DELETE(req: NextRequest, { params }: Props) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.blogPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
