import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RichTextRenderer from "@/components/RichTextRenderer";
import CommentForm from "@/components/CommentForm";

export const dynamic = "force-dynamic";
import { Calendar, ArrowLeft, MessageCircle } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug, published: true } });
  if (!post) return { title: "Post Not Found — The Ratist" };
  return { title: `${post.title} — The Ratist`, description: post.excerpt ?? undefined };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget view count increment
  prisma.blogPost.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const post = await prisma.blogPost.findUnique({
    where: { slug, published: true },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      comments: {
        include: { author: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Blog
      </Link>

      {post.coverImage && (
        <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden mb-8 bg-[var(--surface-2)]">
          <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
        </div>
      )}

      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">{post.title}</h1>

      <div className="flex items-center gap-3 mb-8 pb-8 border-b border-[var(--border)]">
        {post.author.avatarUrl && (
          <Image src={post.author.avatarUrl} alt="" width={36} height={36} className="rounded-full w-9 h-9 object-cover" />
        )}
        <div>
          <p className="text-sm font-medium text-white">{post.author.name}</p>
          <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {post.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      {/* Content */}
      <RichTextRenderer content={post.content} />

      {/* Comments */}
      <div className="mt-12 pt-8 border-t border-[var(--border)]">
        <h2 className="text-base font-semibold text-white mb-6 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[var(--ratist-red)]" />
          {post.comments.length} Comment{post.comments.length !== 1 ? "s" : ""}
        </h2>

        <CommentForm slug={slug} />

        {post.comments.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] mt-6">No comments yet. Be the first.</p>
        ) : (
          <div className="space-y-6">
            {post.comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                {comment.author.avatarUrl ? (
                  <Image src={comment.author.avatarUrl} alt="" width={32} height={32} className="rounded-full w-8 h-8 object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] shrink-0 mt-0.5 flex items-center justify-center text-xs text-[var(--foreground-muted)]">
                    {comment.author.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
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
      </div>
    </div>
  );
}
