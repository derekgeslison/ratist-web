import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// Per-companion follow toggle. While a companion has at least one
// season in airing status, the public viewer surfaces a Follow button
// that hits this endpoint. Followers receive a notification each time
// the cron sweep generates a new episode's content for any season of
// the companion. Follows persist past season completion so a user's
// subscription carries through to the next airing season of the same
// show without re-following.
//
// GET → { following: boolean }
// POST → { following: true }   (idempotent — re-follow is a no-op)
// DELETE → { following: false } (idempotent — already-unfollowed is fine)

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ following: false });
  const { id } = await ctx.params;
  const existing = await prisma.companionFollow.findUnique({
    where: { companionId_userId: { companionId: id, userId: user.id } },
    select: { id: true },
  });
  return NextResponse.json({ following: !!existing });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to follow this Watch Companion." }, { status: 401 });

  const { id } = await ctx.params;
  // Surface a 404 rather than letting the FK error surface as a 500.
  const companion = await prisma.watchCompanion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!companion) return NextResponse.json({ error: "Companion not found" }, { status: 404 });

  await prisma.companionFollow.upsert({
    where: { companionId_userId: { companionId: id, userId: user.id } },
    create: { companionId: id, userId: user.id },
    update: {}, // idempotent — duplicate follow is a no-op
  });
  return NextResponse.json({ following: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const { id } = await ctx.params;
  await prisma.companionFollow.deleteMany({
    where: { companionId: id, userId: user.id },
  });
  return NextResponse.json({ following: false });
}
