/**
 * Two Thumbs vote endpoints. GET returns counts (always callable, used
 * to render the bar without a vote). POST upserts a vote (auth required).
 * DELETE clears the vote.
 *
 * Vote shape: "up" (user agrees with the thumbs-up side of the post)
 * or "down" (agrees with the thumbs-down side).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadPost(slug: string) {
  return prisma.blogPost.findFirst({
    where: { slug, type: "PUNCH_AND_JUDY", published: true },
    select: { id: true },
  });
}

async function tally(postId: string, userId: string | null) {
  const [up, down, mine] = await Promise.all([
    prisma.twoThumbsVote.count({ where: { postId, vote: "up" } }),
    prisma.twoThumbsVote.count({ where: { postId, vote: "down" } }),
    userId
      ? prisma.twoThumbsVote.findUnique({ where: { userId_postId: { userId, postId } }, select: { vote: true } })
      : Promise.resolve(null),
  ]);
  return { up, down, total: up + down, myVote: mine?.vote ?? null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getAuthedUser(req);
  return NextResponse.json(await tally(post.id, user?.id ?? null));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });

  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const vote = body?.vote;
  if (vote !== "up" && vote !== "down") {
    return NextResponse.json({ error: "vote must be 'up' or 'down'" }, { status: 400 });
  }

  await prisma.twoThumbsVote.upsert({
    where: { userId_postId: { userId: user.id, postId: post.id } },
    create: { userId: user.id, postId: post.id, vote },
    update: { vote },
  });

  return NextResponse.json(await tally(post.id, user.id));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });

  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.twoThumbsVote.deleteMany({
    where: { userId: user.id, postId: post.id },
  });

  return NextResponse.json(await tally(post.id, user.id));
}
