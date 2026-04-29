import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Users, Sparkles, Film, TrendingUp, Brain } from "lucide-react";

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
import NavEntryRegister from "@/components/NavEntryRegister";

const TOOLS = [
  {
    icon: Users,
    title: "Shared Cast & Crew",
    description: "Select 2–4 movies or shows to find actors and directors they share, or select 2–6 people to find titles they share.",
    href: "/tools/shared-cast",
  },
  {
    icon: Sparkles,
    title: "What Should I Watch?",
    description: "Answer a few quick questions about your mood, preferred era, and runtime — and get personalized movie and TV show recommendations.",
    href: "/tools/recommend",
  },
  {
    icon: TrendingUp,
    title: "Box Office Insights",
    description: "All-time grossers, year-by-year top earners, franchise and studio rankings, ROI champions, and per-decade leaderboards across film history.",
    href: "/box-office",
  },
  {
    icon: Brain,
    title: "Cine-Q Trivia",
    description: "Daily movie trivia with weighted difficulty scoring. Climb the leaderboard, earn badges, and prove you really know your cinema.",
    href: "/community/cineq",
  },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [popular, topRated, nowPlaying, upcoming, popularShows, trendingMovies, trendingShows, spotlights, recentNews, editorialPosts, recentForumThreads] = await Promise.all([
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
    prisma.blogPost.findMany({
      where: { published: true, publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true, slug: true, title: true, excerpt: true,
        coverImage: true, publishedAt: true, type: true,
      },
    }),
    prisma.forumThread.findMany({
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true, slug: true, title: true, threadType: true,
        viewCount: true, hasSpoilers: true,
        author: { select: { name: true } },
        _count: { select: { posts: true } },
      },
    }),
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
      <NavEntryRegister title="Home" />
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

        {/* Now Playing in Theaters — sourced from TMDB's curated
           /movie/now_playing endpoint (US region), so this rail reflects
           what's actually in theaters right now rather than a global mix
           of recent theatrical dates. View All scopes to movies-only +
           newest-first since the rail itself is theatrical-movie-only. */}
        <MovieRow
          title="Now Playing in Theaters"
          movies={nowPlaying.results.slice(0, 12)}
          viewAllHref="/movies?releaseStatus=now_playing&type=movie&sort=newest"
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

        {/* From Our Editors — pulls latest published BlogPost rows
            (BLOG / MOVIE_MAP / PUNCH_AND_JUDY) with type-coded labels
            and per-type routes. Surfaces editorial / community-curated
            content distinct from the trailer/article news rail above. */}
        {editorialPosts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">From Our Editors</h2>
              <Link href="/blog" className="text-sm text-[var(--ratist-red)] hover:underline font-medium">
                View all posts &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {editorialPosts.map((p) => {
                const route =
                  p.type === "PUNCH_AND_JUDY" ? `/two-thumbs/${p.slug}` :
                  p.type === "MOVIE_MAP" ? `/movie-maps/${p.slug}` :
                  `/blog/${p.slug}`;
                const label =
                  p.type === "PUNCH_AND_JUDY" ? "Two Thumbs" :
                  p.type === "MOVIE_MAP" ? "Movie Map" :
                  "Blog";
                const labelBg =
                  p.type === "PUNCH_AND_JUDY" ? "bg-[var(--ratist-red)]/90" :
                  p.type === "MOVIE_MAP" ? "bg-purple-600/90" :
                  "bg-blue-600/90";
                return (
                  <Link
                    key={p.id}
                    href={route}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors group flex flex-col"
                  >
                    <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
                      {p.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.coverImage} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)]">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                      <div className={`absolute top-2 left-2 ${labelBg} text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded`}>
                        {label}
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col gap-1">
                      <p className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{p.title}</p>
                      {p.excerpt && <p className="text-xs text-[var(--foreground-muted)] line-clamp-2">{p.excerpt}</p>}
                      {p.publishedAt && (
                        <p className="text-[11px] text-[var(--foreground-muted)] mt-auto pt-1">
                          {new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Coming Soon — View All routes to /releases (the
            dedicated release-calendar page) instead of the generic
            /movies filter, so users get the personalized + filterable
            experience built specifically for upcoming films. */}
        {upcoming.results.length > 0 && (
          <MovieRow
            title="Coming Soon"
            movies={upcoming.results.slice(0, 12)}
            viewAllHref="/releases"
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

        {/* Recent Forum Discussions */}
        {recentForumThreads.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Forum Discussions</h2>
              <Link href="/forum" className="text-sm text-[var(--ratist-red)] hover:underline font-medium">
                Visit the forum &rarr;
              </Link>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]/60 overflow-hidden">
              {recentForumThreads.map((t) => {
                const typeLabel = t.threadType.charAt(0).toUpperCase() + t.threadType.slice(1);
                const typeColor =
                  t.threadType === "debate" ? "text-[var(--ratist-red)]" :
                  t.threadType === "theory" ? "text-purple-400" :
                  t.threadType === "poll" ? "text-amber-400" :
                  t.threadType === "recommendation" ? "text-emerald-400" :
                  "text-blue-400";
                return (
                  <Link
                    key={t.id}
                    href={`/forum/t/${t.slug}`}
                    className="flex items-start gap-3 p-4 hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${typeColor}`}>{typeLabel}</span>
                        {t.author?.name && (
                          <span className="text-[11px] text-[var(--foreground-muted)]">by {t.author.name}</span>
                        )}
                        {t.hasSpoilers && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500/90">Spoilers</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-white line-clamp-1">{t.title}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--foreground-muted)] shrink-0 mt-1 whitespace-nowrap">
                      <span>{t._count.posts} {t._count.posts === 1 ? "reply" : "replies"}</span>
                      <span className="hidden sm:inline">{t.viewCount} views</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* The Ratist Method — surfaces the actual rating formula and
            category weights so the home page itself contains substantive
            original methodology content (rather than only linking to /about). */}
        <section>
          <div className="bg-[var(--surface)] border-l-4 border-l-[var(--ratist-red)] border border-[var(--border)] rounded-xl p-6 sm:p-8">
            <p className="text-xs uppercase tracking-widest text-[var(--ratist-red)] font-semibold mb-2">
              The Ratist Method
            </p>
            <h2 className="text-white text-xl sm:text-2xl font-bold mb-3">
              Five categories. One score that&apos;s actually yours.
            </h2>
            <p className="text-[var(--foreground-muted)] text-sm sm:text-base leading-relaxed max-w-3xl mb-5">
              Most ratings collapse a movie or show into a single thumb or star. We don&apos;t. Every Ratist rating breaks a film down across five weighted categories, plus your gut-feel overall — and the algorithm folds in your personal taste profile, so a 7.2 from someone else isn&apos;t the same 7.2 you&apos;d give it.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
              {[
                { name: "Story & Narrative", weight: 5 },
                { name: "Production & Style", weight: 3 },
                { name: "Emotive Effect", weight: 3 },
                { name: "Acting & Casting", weight: 3 },
                { name: "Pure Entertainment", weight: 2 },
              ].map((c) => (
                <div key={c.name} className="bg-black/30 rounded-lg p-3 border border-[var(--border)]/40">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">Weight ×{c.weight}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{c.name}</p>
                </div>
              ))}
            </div>

            <pre className="text-xs sm:text-sm text-[var(--foreground-muted)] bg-black/40 border border-[var(--border)]/50 rounded-lg p-3 sm:p-4 overflow-x-auto mb-4 font-mono leading-relaxed">
{`weighted_base  =  ( Story×5  +  Style×3  +  Emotive×3  +  Acting×3  +  Entertainment×2 )  /  16
ratist_rating  =  ( weighted_base  +  your_overall )  /  2`}
            </pre>

            <p className="text-[var(--foreground-muted)] text-sm leading-relaxed max-w-3xl mb-4">
              Each category has required and optional sub-criteria scored 1–10. Story carries the most weight because narrative is the spine of nearly every film; Pure Entertainment carries the least because rewatchability is real, but it&apos;s not why a movie is great. The blend with your overall score keeps the rubric honest — you can love something flawed or admire something cold.
            </p>

            <Link
              href="/about"
              className="text-[var(--ratist-red)] text-sm font-semibold hover:underline"
            >
              Read the full methodology &rarr;
            </Link>
          </div>
        </section>

        {/* Born Today */}
        <BirthdaySection />
      </div>
    </div>
  );
}
