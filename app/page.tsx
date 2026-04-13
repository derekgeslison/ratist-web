import Link from "next/link";
import Image from "next/image";
import { Users, Sparkles, Swords, Film } from "lucide-react";
import { getPopularMovies, getTopRatedMovies, getNowPlayingMovies, getUpcomingMovies, getPopularShows } from "@/lib/tmdb";
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

export const revalidate = 3600; // Revalidate home page every hour

export default async function HomePage() {
  const [popular, topRated, nowPlaying, upcoming, popularShows, spotlights, recentNews] = await Promise.all([
    getPopularMovies(),
    getTopRatedMovies(Math.floor(Math.random() * 10) + 1),
    getNowPlayingMovies(),
    getUpcomingMovies(),
    getPopularShows(),
    prisma.siteSpotlight.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.newsItem.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true, type: true, title: true, slug: true,
        coverImage: true, posterPath: true, youtubeKey: true,
        publishedAt: true, excerpt: true,
        author: { select: { name: true } },
      },
    }),
  ]);

  // Hero carousel: popular movies filtered to rating >= 7.0 with a backdrop, up to 6
  const heroMovies = popular.results
    .filter((m) => m.backdrop_path && m.vote_average >= 7.0)
    .slice(0, 6);

  return (
    <div>
      {/* Brand lockup — above the hero so the logo is the first thing visitors see */}
      <div className="bg-[var(--surface)] py-8 sm:py-10 border-b border-[var(--border)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-3 text-center">
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

      <HeroBanner movies={heroMovies} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* Personalized section */}
        <PersonalizedSection />

        {/* Backstage Pass promo — hidden for subscribers */}
        <BackstagePassPromo />

        {/* Admin Spotlights */}
        {spotlights.length > 0 && (
          <section className="space-y-3">
            {spotlights.map((s) => (
              <Link
                key={s.id}
                href={s.linkUrl}
                className="flex items-center gap-4 bg-gradient-to-r from-[var(--ratist-red)]/10 to-transparent border border-[var(--ratist-red)]/30 rounded-xl p-5 hover:border-[var(--ratist-red)] transition-colors group"
              >
                {s.imageUrl && (
                  <Image src={s.imageUrl} alt="" width={80} height={80} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--ratist-red)] font-semibold uppercase tracking-wider mb-1">
                    {s.type === "blog" ? "New Post" : s.type === "punch_and_judy" ? "Punch & Judy" : s.type === "feature" ? "New Feature" : "Spotlight"}
                  </p>
                  <p className="text-base font-bold text-white group-hover:text-[var(--ratist-red)] transition-colors">{s.title}</p>
                  {s.description && <p className="text-sm text-[var(--foreground-muted)] mt-1 line-clamp-2">{s.description}</p>}
                </div>
                <span className="text-sm text-[var(--ratist-red)] font-semibold shrink-0 hidden sm:block">
                  {s.linkLabel} &rarr;
                </span>
              </Link>
            ))}
          </section>
        )}

        {/* Now Playing */}
        <MovieRow
          title="Now Playing in Theaters"
          movies={nowPlaying.results.slice(0, 12)}
          viewAllHref="/movies?theaterStatus=now_playing"
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
              {recentNews.map((item) => (
                <Link
                  key={item.id}
                  href={item.type === "EDITORIAL" && item.slug ? `/news/${item.slug}` : `/news${item.type === "TRAILER" ? "?type=trailers" : ""}`}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)]/50 transition-colors group flex flex-col"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-[var(--surface-2)] overflow-hidden">
                    {item.youtubeKey ? (
                      <img
                        src={`https://img.youtube.com/vi/${item.youtubeKey}/mqdefault.jpg`}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : item.coverImage ? (
                      <img
                        src={item.coverImage}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : item.posterPath ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image src={`https://image.tmdb.org/t/p/w300${item.posterPath}`} alt="" width={120} height={180} className="rounded" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)]">
                        <Film className="w-8 h-8" />
                      </div>
                    )}
                    {item.type === "TRAILER" && (
                      <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
                        Trailer
                      </div>
                    )}
                    {item.type === "EDITORIAL" && (
                      <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded">
                        Article
                      </div>
                    )}
                  </div>
                  {/* Text */}
                  <div className="p-3 flex-1">
                    <p className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">{item.title}</p>
                    {item.publishedAt && (
                      <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
                        {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {item.author && ` · ${item.author.name}`}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Coming Soon */}
        {upcoming.results.length > 0 && (
          <MovieRow
            title="Coming Soon"
            movies={upcoming.results.slice(0, 12)}
            viewAllHref="/movies?theaterStatus=upcoming"
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
