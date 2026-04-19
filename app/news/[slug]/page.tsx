import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RichTextRenderer from "@/components/RichTextRenderer";
import CommentSection from "@/components/CommentSection";
import LinkedMediaRow from "@/components/forum/LinkedMediaRow";
import LinkedPeopleRow from "@/components/forum/LinkedPeopleRow";

export const dynamic = "force-dynamic";
import { Calendar, ArrowLeft, ExternalLink } from "lucide-react";
import PageShare from "@/components/PageShare";
import AdUnit from "@/components/AdUnit";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const item = await prisma.newsItem.findUnique({ where: { slug, published: true }, select: { title: true, excerpt: true, coverImage: true } });
  if (!item) return { title: "Article Not Found" };
  return {
    title: item.title,
    description: item.excerpt ?? undefined,
    openGraph: {
      title: `${item.title} — The Ratist`,
      description: item.excerpt ?? undefined,
      ...(item.coverImage ? { images: [{ url: item.coverImage }] } : {}),
    },
    twitter: {
      card: item.coverImage ? "summary_large_image" : "summary",
      title: `${item.title} — The Ratist`,
      description: item.excerpt ?? undefined,
      ...(item.coverImage ? { images: [item.coverImage] } : {}),
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;

  // Fire-and-forget view count
  prisma.newsItem.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const item = await prisma.newsItem.findUnique({
    where: { slug, published: true },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
    },
  });

  if (!item) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/news" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to News
      </Link>

      {/* Cover image */}
      {item.coverImage && (
        <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-[var(--surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Title & meta */}
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">{item.title}</h1>

      <div className="flex items-center gap-3 text-sm text-[var(--foreground-muted)] mb-6 flex-wrap">
        {item.showAuthor !== false && item.author && (
          <div className="flex items-center gap-2">
            {item.author.avatarUrl && (
              <Image src={item.author.avatarUrl} alt="" width={24} height={24} className="rounded-full" />
            )}
            <span>{item.author.name}</span>
          </div>
        )}
        {item.publishedAt && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>

      {/* Linked movies/shows & celebrities */}
      {item.media.length > 0 && <LinkedMediaRow media={item.media} />}
      {item.people.length > 0 && <LinkedPeopleRow people={item.people} />}

      {/* YouTube embed */}
      {item.youtubeKey && (
        <div className="aspect-video rounded-xl overflow-hidden mb-6">
          <iframe
            src={`https://www.youtube.com/embed/${item.youtubeKey}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Article body */}
      {item.content && (
        <div className="prose-container mb-8">
          <RichTextRenderer content={item.content} />
        </div>
      )}

      {/* Source attribution */}
      {item.sourceUrl && item.sourceName && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 mb-8 flex items-center gap-2">
          <span className="text-xs text-[var(--foreground-muted)]">Source:</span>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--ratist-red)] hover:underline flex items-center gap-1">
            {item.sourceName} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_NEWS ?? ""} format="auto" className="mb-6" />

      <PageShare title={item.title} />

      <div className="mt-8">
        <CommentSection targetType="news" targetId={item.id} />
      </div>
    </div>
  );
}
