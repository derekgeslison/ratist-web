import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { checkCommunityRateLimit } from "@/lib/rate-limit";
import { invalidateCollectionMatchCache } from "@/lib/collection-match";
import { checkBadges, recheckBadges } from "@/lib/badges";

export const dynamic = "force-dynamic";

const MIN_ITEMS_TO_PUBLISH = 5;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "collection";
}

async function uniqueSlug(userId: string, base: string, currentCollectionId: string): Promise<string> {
  // The current collection's own row shouldn't count as a conflict if the
  // base slug is already assigned to it (re-publish keeps the same URL).
  let slug = base;
  let n = 1;
  // Cap the loop so a pathological collision pattern can't run away.
  while (n < 100) {
    const conflict = await prisma.customCollection.findFirst({
      where: { userId, slug, id: { not: currentCollectionId } },
      select: { id: true },
    });
    if (!conflict) return slug;
    n++;
    slug = `${base}-${n}`;
  }
  // Fallback: append a short random suffix.
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json({ error: "Publishing collections is a Backstage Pass feature." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.customCollection.findUnique({
    where: { id },
    select: {
      userId: true,
      name: true,
      slug: true,
      visibility: true,
      _count: { select: { items: true } },
    },
  });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.visibility === "public") {
    return NextResponse.json({ error: "Collection is already public." }, { status: 400 });
  }
  if (existing._count.items < MIN_ITEMS_TO_PUBLISH) {
    return NextResponse.json(
      { error: `A public collection needs at least ${MIN_ITEMS_TO_PUBLISH} items. Add a few more before publishing.` },
      { status: 400 },
    );
  }

  const limitMessage = await checkCommunityRateLimit(user.id, user.isAdmin, "collection");
  if (limitMessage) return NextResponse.json({ error: limitMessage }, { status: 429 });

  // Optional admin-only "official" attribution. Non-admins passing this
  // are silently ignored rather than 403'd — keeps the public flow
  // simple and the flag never gets set without admin intent.
  const body = await req.json().catch(() => null);
  const isOfficial = user.isAdmin && body?.isOfficial === true;

  const slug = existing.slug ?? await uniqueSlug(user.id, slugify(existing.name), id);

  await prisma.customCollection.update({
    where: { id },
    data: {
      visibility: "public",
      slug,
      publishedAt: new Date(),
      ...(isOfficial ? { isOfficial: true } : {}),
    },
  });

  // Wipe any stale cache rows so the freshly public collection gets
  // re-scored on first feed view rather than serving an old null entry
  // from a private-era prediction attempt.
  await invalidateCollectionMatchCache(id);

  // Curator badge thresholds may have just been crossed. Fire-and-forget
  // matches the existing checkBadges convention everywhere else.
  checkBadges(user.id, "collection_publish").catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true, slug });
}

// Allow unpublishing without losing the slug — re-publishing later
// reuses the same URL so links shared while public don't break
// permanently after a back-and-forth.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.customCollection.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.customCollection.update({
    where: { id },
    data: { visibility: "private", publishedAt: null },
  });

  await invalidateCollectionMatchCache(id);

  // Unpublishing reduces the user's public-collection count; the non-
  // permanent Curator/Master Curator badges may need to be revoked.
  recheckBadges(user.id, "collection_publish").catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true });
}
