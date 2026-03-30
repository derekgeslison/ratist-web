import Link from "next/link";
import Image from "next/image";
import { Users, Star, Swords, Film } from "lucide-react";
import { getPopularMovies, getTopRatedMovies, getNowPlayingMovies } from "@/lib/tmdb";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import PersonalizedSection from "@/components/PersonalizedSection";
import BrandCTAButtons from "@/components/BrandCTAButtons";

const TOOLS = [
  {
    icon: Swords,
    title: "The Matchup",
    description: "Pick two movies and compare them head-to-head across every Ratist rating category. Let the data settle the debate.",
    href: "/tools/matchup",
  },
  {
    icon: Users,
    title: "Shared Cast & Crew",
    description: "Discover who worked across your favorite films. Search any two movies to reveal shared cast and crew.",
    href: "/tools/shared-cast",
  },
  {
    icon: Film,
    title: "What Else Do I Know Them From?",
    description: "Search an actor or director and see only the movies you've personally seen or rated.",
    href: "/tools/actor-lookup",
  },
  {
    icon: Star,
    title: "Personal Rankings",
    description: "Build your definitive ranked list of everything you've seen. Drag, sort, and filter by year.",
    href: "/tools/rankings",
  },
];

export default async function HomePage() {
  const [popular, topRated, nowPlaying] = await Promise.all([
    getPopularMovies(),
    getTopRatedMovies(),
    getNowPlayingMovies(),
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

        {/* Now Playing */}
        <MovieRow
          title="Now Playing in Theaters"
          movies={nowPlaying.results.slice(0, 12)}
          viewAllHref="/movies?theaterStatus=now_playing"
        />

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

        {/* Top Rated */}
        <MovieRow
          title="Top Rated"
          movies={topRated.results.slice(0, 12)}
          viewAllHref="/movies?sort=top_rated"
        />

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
              href="/movies"
              className="text-[var(--ratist-red)] text-sm font-semibold hover:underline"
            >
              Learn how ratings work &rarr;
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
