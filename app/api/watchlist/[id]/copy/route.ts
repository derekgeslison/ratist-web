import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to copy a watchlist" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const isPrivate = Boolean(body.isPrivate);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name is too long (max 80 characters)" }, { status: 400 });

  const source = await prisma.watchlist.findUnique({
    where: { id },
    include: {
      collaborators: { select: { userId: true, status: true } },
      movies: { where: { isChecked: false }, select: { movieId: true, sortOrder: true } },
      shows: { where: { isChecked: false }, select: { tvShowId: true, sortOrder: true } },
    },
  });
  if (!source) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });

  // Private lists can only be copied by owner or accepted collaborator
  const isOwner = source.userId === user.id;
  const isCollaborator = source.collaborators.some((c) => c.userId === user.id && c.status === "accepted");
  if (source.isPrivate && !isOwner && !isCollaborator) {
    return NextResponse.json({ error: "This watchlist is private" }, { status: 403 });
  }

  // Generate unique slug for the new watchlist under this user
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.watchlist.findUnique({ where: { userId_slug: { userId: user.id, slug } } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const copy = await prisma.watchlist.create({
    data: {
      userId: user.id,
      name,
      slug,
      description: description || null,
      isPrivate,
      movies: {
        create: source.movies.map((m) => ({ movieId: m.movieId, sortOrder: m.sortOrder })),
      },
      shows: {
        create: source.shows.map((s) => ({ tvShowId: s.tvShowId, sortOrder: s.sortOrder })),
      },
    },
    select: { id: true, slug: true, name: true },
  });

  return NextResponse.json({
    watchlist: copy,
    copied: { movies: source.movies.length, shows: source.shows.length },
  });
}
