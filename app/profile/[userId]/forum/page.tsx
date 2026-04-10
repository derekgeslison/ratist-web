import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import ThreadCard from "@/components/forum/ThreadCard";
import AdUnit from "@/components/AdUnit";

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  if (!user) return { title: "Forum Posts" };
  return { title: `${user.name}'s Forum Posts — The Ratist` };
}

export default async function UserForumPage({ params }: Props) {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, name: true, firebaseUid: true, isPrivate: true, deletedAt: true },
  });

  if (!user || user.deletedAt) notFound();

  const threads = await prisma.forumThread.findMany({
    where: { authorId: user.id },
    include: {
      author: {
        select: {
          id: true, firebaseUid: true, name: true, avatarUrl: true,
          _count: { select: { userBadges: true, ratings: true } },
        },
      },
      opponent: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
      tags: { select: { tag: true } },
      poll: { include: { options: { include: { _count: { select: { votes: true } } }, take: 4 } } },
      debateVotes: { select: { side: true } },
      _count: { select: { posts: true } },
      posts: { orderBy: { createdAt: "asc" }, take: 1, select: { content: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get comment counts
  const threadIds = threads.map((t) => t.id);
  const commentCounts = threadIds.length > 0
    ? await prisma.comment.groupBy({
        by: ["targetId"],
        where: { targetType: "forumThread", targetId: { in: threadIds } },
        _count: { id: true },
      })
    : [];
  const commentCountMap = new Map(commentCounts.map((c) => [c.targetId, c._count.id]));

  const enriched = threads.map((t) => ({
    ...t,
    commentCount: commentCountMap.get(t.id) ?? 0,
    debateVoteCounts: t.threadType === "debate" ? {
      op: t.debateVotes.filter((v) => v.side === "op").length,
      opponent: t.debateVotes.filter((v) => v.side === "opponent").length,
    } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/profile/${user.firebaseUid}`}
          className="flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {user.name}
        </Link>
        <span className="text-[var(--foreground-muted)]">/</span>
        <h1 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-cyan-400" /> Forum Posts
        </h1>
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-4" />

      {enriched.length === 0 ? (
        <div className="text-center py-10 text-[var(--foreground-muted)]">
          No forum posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map((t) => (
            <ThreadCard key={t.id} {...t} />
          ))}
        </div>
      )}
    </div>
  );
}
