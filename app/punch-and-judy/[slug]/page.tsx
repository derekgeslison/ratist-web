import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RichTextRenderer from "@/components/RichTextRenderer";
import CommentForm from "@/components/CommentForm";
import { ArrowLeft, Calendar, Swords, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug, published: true, type: "PUNCH_AND_JUDY" } });
  if (!post) return { title: "Not Found" };
  return { title: post.title, description: post.excerpt ?? undefined };
}

export default async function PunchAndJudyPostPage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget view count increment
  prisma.blogPost.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const post = await prisma.blogPost.findUnique({
    where: { slug, published: true, type: "PUNCH_AND_JUDY" },
    include: {
      author: { select: { name: true, avatarUrl: true } },
      comments: {
        include: { author: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/punch-and-judy" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Punch & Judy
      </Link>
      <div className="flex items-center gap-2 text-[var(--ratist-red)] mb-3">
        <Swords className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Punch & Judy</span>
      </div>
      {post.coverImage && (
        <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden mb-8 bg-[var(--surface-2)]">
          <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
        </div>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">{post.title}</h1>
      <div className="flex items-center gap-3 mb-8 pb-8 border-b border-[var(--border)]">
        {post.author.avatarUrl && (
          <Image src={post.author.avatarUrl} alt="" width={36} height={36} className="rounded-full w-9 h-9 object-cover" />
        )}
        <div>
          <p className="text-sm font-medium text-white">{post.author.name}</p>
          <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
      <RichTextRenderer content={post.content} />
      <div className="mt-12 pt-8 border-t border-[var(--border)]">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          {post.comments.length} Comment{post.comments.length !== 1 ? "s" : ""}
        </h2>
        {post.comments.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] mb-6">No comments yet. Be the first.</p>
        ) : (
          <div className="space-y-4 mb-6">
            {post.comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                {comment.author.avatarUrl ? (
                  <Image src={comment.author.avatarUrl} alt="" width={32} height={32} className="rounded-full w-8 h-8 object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                    {comment.author.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white">{comment.author.name}</span>
                    <span className="text-xs text-[var(--foreground-muted)]">
                      {comment.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <CommentForm slug={slug} />
      </div>
    </div>
  );
}
