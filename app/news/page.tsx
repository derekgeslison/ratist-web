import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "News", description: "The latest movie and TV show news, trailers, announcements, and editorial takes from The Ratist." };

export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { Newspaper, Calendar, Eye, Film, Tv, Play } from "lucide-react";
import AdUnit from "@/components/AdUnit";
import NewsTrailerCard from "@/components/NewsTrailerCard";

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const { type, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const perPage = 20;

  const typeFilter = type === "editorial" ? { type: "EDITORIAL" as const }
    : type === "trailers" ? { type: "TRAILER" as const }
    : {};

  const [items, total] = await Promise.all([
    prisma.newsItem.findMany({
      where: { published: true, ...typeFilter },
      orderBy: { publishedAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
      select: {
        id: true, type: true, title: true, slug: true,
        excerpt: true, coverImage: true, posterPath: true,
        publishedAt: true, viewCount: true,
        movieTmdbId: true, showTmdbId: true,
        youtubeKey: true, sourceUrl: true, sourceName: true, showAuthor: true,
        author: { select: { name: true, avatarUrl: true } },
      },
    }),
    prisma.newsItem.count({ where: { published: true, ...typeFilter } }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">News</h1>
        <span className="text-sm text-[var(--foreground-muted)]">{total} article{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
        {[
          { value: undefined, label: "All" },
          { value: "editorial", label: "Articles" },
          { value: "trailers", label: "Trailers" },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={`/news${tab.value ? `?type=${tab.value}` : ""}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              type === tab.value || (!type && !tab.value)
                ? "border-[var(--ratist-red)] text-white"
                : "border-transparent text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_NEWS ?? ""} format="auto" className="mb-6" />

      {items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No news yet. Check back soon!</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) =>
            item.type === "TRAILER" && item.youtubeKey ? (
              <NewsTrailerCard
                key={item.id}
                youtubeKey={item.youtubeKey}
                title={item.title}
                publishedAt={item.publishedAt?.toISOString() ?? null}
                movieTmdbId={item.movieTmdbId}
                showTmdbId={item.showTmdbId}
                posterPath={item.posterPath}
              />
            ) : (
            <article key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors">
              {item.type === "EDITORIAL" && item.slug ? (
                <Link href={`/news/${item.slug}`} className="flex gap-4 p-4">
                  {item.coverImage ? (
                    <div className="relative w-32 sm:w-40 aspect-video rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : item.posterPath ? (
                    <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0">
                      <Image src={`https://image.tmdb.org/t/p/w154${item.posterPath}`} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">Article</span>
                      {item.sourceName && <span className="text-[10px] text-[var(--foreground-muted)]">via {item.sourceName}</span>}
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold text-white line-clamp-2 mb-1">{item.title}</h2>
                    {item.excerpt && <p className="text-sm text-[var(--foreground-muted)] line-clamp-2">{item.excerpt}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--foreground-muted)]">
                      {item.showAuthor !== false && item.author && <span>by {item.author.name}</span>}
                      {item.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {item.viewCount}</span>
                    </div>
                  </div>
                </Link>
              ) : (
                // Generic fallback for other types
                <div className="p-4">
                  <h2 className="text-base font-semibold text-white">{item.title}</h2>
                  {item.excerpt && <p className="text-sm text-[var(--foreground-muted)] mt-1">{item.excerpt}</p>}
                </div>
              )}
            </article>
            )
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <NewsPagination current={page} total={totalPages} typeParam={type} />
      )}
    </div>
  );
}

function NewsPagination({ current, total, typeParam }: { current: number; total: number; typeParam?: string }) {
  function buildUrl(p: number) {
    const params = new URLSearchParams();
    if (typeParam) params.set("type", typeParam);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/news${qs ? `?${qs}` : ""}`;
  }

  const VISIBLE = 5;
  const pages: (number | "...")[] = [];

  if (total <= VISIBLE + 2) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, current - Math.floor(VISIBLE / 2));
    let end = start + VISIBLE - 1;
    if (end >= total) {
      end = total - 1;
      start = Math.max(2, end - VISIBLE + 1);
    }
    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("...");
    pages.push(total);
  }

  const linkClass = "px-3 py-1.5 text-sm rounded border transition-colors";
  const inactiveClass = `${linkClass} border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white`;
  const activeClass = `${linkClass} border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10`;

  return (
    <div className="flex flex-col items-center gap-3 mt-10">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {current > 1 && (
          <Link href={buildUrl(current - 1)} className={inactiveClass}>&larr; Prev</Link>
        )}
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-[var(--foreground-muted)]">...</span>
          ) : (
            <Link key={p} href={buildUrl(p)} className={p === current ? activeClass : inactiveClass}>{p}</Link>
          )
        )}
        {current < total && (
          <Link href={buildUrl(current + 1)} className={inactiveClass}>Next &rarr;</Link>
        )}
      </div>
      {total > VISIBLE && (
        <p className="text-xs text-[var(--foreground-muted)]">Page {current} of {total}</p>
      )}
    </div>
  );
}
