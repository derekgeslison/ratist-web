import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Users, Sparkles, Swords, Film } from "lucide-react";

export const metadata: Metadata = { alternates: { canonical: "/" } };

import { getPopularMovies, getTopRatedMovies, getNowPlayingMovies, getUpcomingMovies, getPopularShows, getTrendingMovies, getTrendingShows } from "@/lib/tmdb";
import { prisma } from "@/lib/prisma";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import ShowRow from "@/components/ShowRow";
import PersonalizedSection from "@/components/PersonalizedSection";
import FollowingFeed from "@/components/FollowingFeed";
import BirthdaySection from "@/components/BirthdaySection";
import BrandCTAButtons from "@/components/BrandCTAButtons";
import AdUnit from "@/components/AdUnit";
import BackstagePassPromo from "@/components/BackstagePassPromo";
import NewsTrailerCard from "@/components/NewsTrailerCard";

const TOOLS = [
  {
    icon: Swords,
    title: "The Matchup",
    description: "Pick two movies or shows and compare them head-to-head across every Ratist rating category. Let the data settle the debate.",
    href: "/tools/matchup",
  },
  {
    icon: Users,
    title: "Shared Cast & Crew",
    description: "Select 2–4 movies or shows to find actors and directors they share, or select 2–6 people to find titles they share.",
    href: "/tools/shared-cast",
  },
  {
    icon: Film,
    title: "What Else Do I Know Them From?",
    description: "Search an actor or director and see only the movies and shows you've personally seen or rated.",
    href: "/tools/actor-lookup",
  },
  {
    icon: Sparkles,
    title: "What Should I Watch?",
    description: "Answer a few quick questions about your mood, preferred era, and runtime — and get personalized movie and TV show recommendations.",
    href: "/tools/recommend",
  },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [popular, topRated, nowPlaying, upcoming, popularShows, trendingMovies, trendingShows, spotlights, recentNews] = await Promise.all([
    getPopularMovies(),
    getTopRatedMovies(Math.floor(Math.random() * 10) + 1),
    getNowPlayingMovies(),
    getUpcomingMovies(),
    getPopularShows(),
    getTrendingMovies("week"),
    getTrendingShows("week"),
    prisma.siteSpotlight.findMany({
      where: {
        isActive: true,
        type: { not: "announcement" },
        placement: { in: ["homepage", "all"] },
        OR: [{ startDate: null }, { startDate: { lte: new Date() } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: new Date() } }] }],
      },
      orderBy: { sortOrder: "asc" },
    }),
    (async () => {
      const newsSelect = {
        id: true, type: true, title: true, slug: true,
        coverImage: true, posterPath: true, youtubeKey: true,
        publishedAt: true, excerpt: true, showAuthor: true,
        author: { select: { name: true } },
      } as const;
      // Ensure at least one editorial article is always in the mix
      const [latestArticle, recent] = await Promise.all([
        prisma.newsItem.findFirst({
          where: { published: true, type: "EDITORIAL", publishedAt: { lte: new Date() } },
          orderBy: { publishedAt: "desc" },
          select: newsSelect,
        }),
        prisma.newsItem.findMany({
          where: { published: true, publishedAt: { lte: new Date() } },
          orderBy: { publishedAt: "desc" },
          take: 6,
          select: newsSelect,
        }),
      ]);
      // If the latest article is already in the top 6, just return as-is
      if (!latestArticle || recent.some((r) => r.id === latestArticle.id)) return recent;
      // Otherwise swap it in for the last item
      return [...recent.slice(0, 5), latestArticle];
    })(),
  ]);

  // Hero carousel: trending movies + shows, interleaved for a balanced mix
  type HeroItem = { id: number; title: string; overview: string; backdrop_path: string | null; vote_average: number; releaseDate: string; mediaType: "movie" | "tv" };
  const heroMoviePool = trendingMovies.results
    .filter((m) => m.backdrop_path && m.vote_average >= 7.0)
    .slice(0, 4)
    .map((m): HeroItem => ({ id: m.id, title: m.title, overview: m.overview, backdrop_path: m.backdrop_path, vote_average: m.vote_average, releaseDate: m.release_date ?? "", mediaType: "movie" }));
  const heroShowPool = trendingShows.results
    .filter((s) => s.backdrop_path && s.vote_average >= 7.0)
    .slice(0, 4)
    .map((s): HeroItem => ({ id: s.id, title: s.name, overview: s.overview, backdrop_path: s.backdrop_path, vote_average: s.vote_average, releaseDate: s.first_air_date ?? "", mediaType: "tv" }));
  // Interleave: movie, show, movie, show...
  const heroItems: HeroItem[] = [];
  const maxLen = Math.max(heroMoviePool.length, heroShowPool.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < heroMoviePool.length) heroItems.push(heroMoviePool[i]);
    if (i < heroShowPool.length) heroItems.push(heroShowPool[i]);
  }

  return (
    <div>
      {/* Brand lockup — above the hero so the logo is the first thing visitors see */}
      <div className="bg-[var(--surface)] py-8 sm:py-10 border-b border-[var(--border)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-3 text-center">
          <h1 className="sr-only">The Ratist — Movie &amp; TV Show Ratings, Community, &amp; Tools</h1>
          <Image
            src="/logo-full.png"
            alt="The Ratist"
            width={320}
            height={160}
            className="h-20 sm:h-28 w-auto"
            priority
          />
          <p className="text-[var(--foreground-muted)] text-sm sm:text-base max-w-lg">
            Deep, criteria-based movie ratings. Personalized recommendations. A community that takes cinema seriously.
          </p>
          <BrandCTAButtons />
        </div>
      </div>

      <HeroBanner items={heroItems} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* Personalized section */}
        <PersonalizedSection />

        {/* Backstage Pass promo — hidden for subscribers */}
        <BackstagePassPromo />

        {/* Admin Spotlights */}
        {spotlights.length > 0 && (
          <section className="space-y-3">
            {spotlights.map((s) => {
              const accent = s.bgColor || "var(--ratist-red)";
              const styleClass =
                s.style === "bold"
                  ? "border-2"
                  : s.style === "gradient"
                    ? "bg-gradient-to-r"
                    : "";
              return (
                <Link
                  key={s.id}
                  href={s.linkUrl}
                  className={`flex items-center gap-4 rounded-xl p-5 transition-colors group border ${styleClass}`}
                  style={{
                    borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                    background:
                      s.style === "gradient"
                        ? `linear-gradient(to right, color-mix(in srgb, ${accent} 15%, transparent), transparent)`
                        : s.style === "bold"
                          ? `color-mix(in srgb, ${accent} 8%, transparent)`
                          : `linear-gradient(to right, color-mix(in srgb, ${accent} 10%, transparent), transparent)`,
                  }}
                >
                  {s.imageUrl && (
                    <Image src={s.imageUrl} alt={s.title} width={80} height={80} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: accent }}>
                      {s.type === "blog" ? "New Post" : s.type === "punch_and_judy" ? "Two Thumbs" : s.type === "feature" ? "New Feature" : "Spotlight"}
                    </p>
                    <p className="text-base font-bold text-white transition-colors" style={{ ["--hover-color" as string]: accent }}>
                      {s.title}
                    </p>
                    {s.description && <p className="text-sm text-[var(--foreground-muted)] mt-1 line-clamp-2">{s.description}</p>}
                  </div>
                  <span className="text-sm font-semibold shrink-0 hidden sm:block" style={{ color: accent }}>
                    {s.linkLabel} &rarr;
                  </span>
                </Link>
              );
            })}
          </section>
        )}

        {/* Now Playing & Streaming */}
        <MovieRow
          title="Now Playing & Streaming"
          movies={nowPlaying.results.slice(0, 12)}
          viewAllHref="/movies?releaseStatus=now_playing"
        />

        {/* Ad — between Now Playing and Tools */}
        <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? ""} format="auto" className="py-2" />

        {/* Tools Spotlight */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Tools &amp; Features</h2>
            <Link href="/tools" className="text-sm text-[var(--ratist-red)] hover:underline font-medium">
              View all tools &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TOOLS.map(({ icon: Icon, title, description, href }) => (
              <Link
                key={href}
                href={href}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--ratist-red)] transition-colors group flex flex-col gap-3"
              >
                <Icon className="w-6 h-6 text-[var(--ratist-red)]" />
                <div className="flex-1">
                  <p className="text-white font-bold text-sm mb-1">{title}</p>
                  <p className="text-[var(--foreground-muted)] text-sm leading-relaxed">
                    {description}
                  </p>
                </div>
                <span className="text-[var(--ratist-red)] text-sm font-semibold group-hover:underline">
                  Explore &rarr;
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Popular */}
        <MovieRow
          title="Popular"
          movies={popular.results.slice(1, 13)}
          viewAllHref="/movies"
        />

        {/* Popular Shows */}
        <ShowRow
          title="Popular TV Shows"
          shows={popularShows.results.slice(0, 12)}
          viewAllHref="/movies?type=tv&sort=popular"
        />

        {/* Latest News & Trailers */}
        {recentNews.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Latest News &amp; Trailers</h2>
              <Link href="/news" className="text-sm text-[var(--ratist-red)] hover:underline font-medium">
                View all news &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentNews.map((item) =>
                item.type === "TRAILER" && item.youtubeKey ? (
                  <NewsTrailerCard
                    key={item.id}
                    youtubeKey={item.youtubeKey}
                    title={item.title}
                    publishedAt={item.publishedAt?.toISOString() ?? null}
                    compact
                  />
                ) : (
                  <Link
                    key={item.id}
                    href={item.slug ? `/news/${item.slug}` : "/news"}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors group flex flex-col"
                  >
                    <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
                      {item.coverImage ? (
                        <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : item.posterPath ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image src={`https://image.tmdb.org/t/p/w300${item.posterPath}`} alt={item.title} width={120} height={180} className="rounded" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)]">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
                        Article
                      </div>
                    </div>
                    <div className="p-3 flex-1">
                      <p className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{item.title}</p>
                      {item.publishedAt && (
                        <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
                          {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {item.showAuthor !== false && item.author && ` · ${item.author.name}`}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              )}
            </div>
          </section>
        )}

        {/* Coming Soon */}
        {upcoming.results.length > 0 && (
          <MovieRow
            title="Coming Soon"
            movies={upcoming.results.slice(0, 12)}
            viewAllHref="/movies?releaseStatus=upcoming"
          />
        )}

        {/* Top Rated */}
        <MovieRow
          title="Top Rated"
          movies={topRated.results.slice(0, 12)}
          viewAllHref="/movies?sort=top_rated"
        />

        {/* From people you follow */}
        <FollowingFeed />

        {/* The Ratist Method */}
        <section>
          <div className="bg-[var(--surface)] border-l-4 border-l-[var(--ratist-red)] border border-[var(--border)] rounded-xl p-6">
            <p className="text-xs uppercase tracking-widest text-[var(--ratist-red)] font-semibold mb-2">
              The Ratist Method
            </p>
            <p className="text-white text-base font-medium mb-2 max-w-3xl">
              Unlike star ratings, The Ratist scores movies across Story, Style, Emotion, Acting, and Entertainment — weighted by your personal preferences.
            </p>
            <p className="text-[var(--foreground-muted)] text-sm max-w-2xl mb-4">
              Your 7.2 isn&apos;t the same as someone else&apos;s. Our algorithm tailors scores to the criteria you care about most, so every rating means something.
            </p>
            <Link
              href="/about"
              className="text-[var(--ratist-red)] text-sm font-semibold hover:underline"
            >
              Learn how ratings work &rarr;
            </Link>
          </div>
        </section>

        {/* Born Today */}
        <BirthdaySection />
      </div>
    </div>
  );
}
