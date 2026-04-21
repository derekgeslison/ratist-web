import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ collections: [] });

  const collections = await prisma.customCollection.findMany({
    where: { userId: user.id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        take: 4, // preview posters only
        select: { posterPath: true },
      },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      prompt: c.prompt,
      mediaType: c.mediaType,
      itemCount: c._count.items,
      previewPosters: c.items.map((i) => i.posterPath).filter(Boolean),
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

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  const mediaType = body?.mediaType === "tv" || body?.mediaType === "any" ? body.mediaType : "movie";
  const items = Array.isArray(body?.items) ? body.items as IncomingItem[] : [];

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
