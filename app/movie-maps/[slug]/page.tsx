import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RichTextRenderer from "@/components/RichTextRenderer";
import CommentSection from "@/components/CommentSection";
import PostLikeButton from "@/components/PostLikeButton";
import LinkedMediaRow from "@/components/forum/LinkedMediaRow";
import LinkedPeopleRow from "@/components/forum/LinkedPeopleRow";
import { ArrowLeft, Calendar, Map } from "lucide-react";
import PageShare from "@/components/PageShare";
import AdUnit from "@/components/AdUnit";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await prisma.blogPost.findFirst({ where: { slug, published: true, type: "MOVIE_MAP", publishedAt: { lte: new Date() } }, select: { title: true, excerpt: true, coverImage: true } });
  if (!post) return { title: "Not Found" };
  const description = post.excerpt ?? undefined;
  return {
    title: post.title,
    description,
    alternates: { canonical: `/movie-maps/${slug}` },
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

export default async function MovieMapPostPage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget view count increment
  prisma.blogPost.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const post = await prisma.blogPost.findFirst({
    where: { slug, published: true, type: "MOVIE_MAP", publishedAt: { lte: new Date() } },
    include: {
      author: { select: { name: true, avatarUrl: true, firebaseUid: true } },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
    },
  });
  if (!post) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    url: `https://www.theratist.com/movie-maps/${slug}`,
    datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
    dateModified: post.updatedAt.toISOString(),
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverImage ? { image: [post.coverImage] } : {}),
    author: {
      "@type": "Person",
      name: post.author.name,
      ...(post.author.firebaseUid ? { url: `https://www.theratist.com/profile/${post.author.firebaseUid}` } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: "The Ratist",
      logo: { "@type": "ImageObject", url: "https://www.theratist.com/icon-512.png" },
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
      { "@type": "ListItem", position: 2, name: "Movie Maps", item: "https://www.theratist.com/movie-maps" },
      { "@type": "ListItem", position: 3, name: post.title, item: `https://www.theratist.com/movie-maps/${slug}` },
    ],
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Link href="/movie-maps" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Movie Maps
      </Link>
      <div className="flex items-center gap-2 text-[var(--ratist-red)] mb-3">
        <Map className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Movie Map</span>
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
            <Calendar className="w-3 h-3" /> {new Date(post.publishedAt ?? post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
      {post.media.length > 0 && <LinkedMediaRow media={post.media} />}
      {post.people.length > 0 && <LinkedPeopleRow people={post.people} />}

      <RichTextRenderer content={post.content} />
      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BLOG_POST ?? ""} format="auto" className="my-8" />
      {/* Comments */}
      <div className="mt-12 pt-8 border-t border-[var(--border)]">
        <CommentSection targetType="blog" targetId={post.id} />
      </div>
    </div>
  );
}
