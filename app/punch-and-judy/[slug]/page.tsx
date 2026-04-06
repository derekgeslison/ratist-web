import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RichTextRenderer from "@/components/RichTextRenderer";
import CommentSection from "@/components/CommentSection";
import PostLikeButton from "@/components/PostLikeButton";
import { ArrowLeft, Calendar, Swords } from "lucide-react";
import PageShare from "@/components/PageShare";
import AdUnit from "@/components/AdUnit";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug, published: true, type: "PUNCH_AND_JUDY" }, select: { title: true, excerpt: true, coverImage: true } });
  if (!post) return { title: "Not Found" };
  const description = post.excerpt ?? undefined;
  return {
    title: post.title,
    description,
    openGraph: {
      title: `${post.title} — The Ratist`,
      description,
      ...(post.coverImage ? { images: [{ url: post.coverImage }] } : {}),
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title: `${post.title} — The Ratist`,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}

export default async function PunchAndJudyPostPage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget view count increment
  prisma.blogPost.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const post = await prisma.blogPost.findUnique({
    where: { slug, published: true, type: "PUNCH_AND_JUDY" },
    include: {
      author: { select: { name: true, avatarUrl: true } },
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
      <div className="flex items-start justify-between gap-2 mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{post.title}</h1>
        <div className="flex items-center gap-3 shrink-0">
          <PostLikeButton targetType="blog" targetId={post.id} />
          <PageShare title={post.title} />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-8 pb-8 border-b border-[var(--border)]">
        {post.showAuthor !== false && post.author.avatarUrl && (
          <Image src={post.author.avatarUrl} alt="" width={36} height={36} className="rounded-full w-9 h-9 object-cover" />
        )}
        <div>
          {post.showAuthor !== false && <p className="text-sm font-medium text-white">{post.author.name}</p>}
          <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
      <RichTextRenderer content={post.content} />

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BLOG_POST ?? ""} format="auto" className="my-8" />

      {/* Discussion */}
      <div className="mt-12 pt-8 border-t border-[var(--border)]">
        <CommentSection targetType="blog" targetId={post.id} />
      </div>
    </div>
  );
}
