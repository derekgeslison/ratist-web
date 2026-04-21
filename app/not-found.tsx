import Link from "next/link";
import Image from "next/image";
import { Film, Home, TrendingUp, Compass } from "lucide-react";
import { getTrendingMovies } from "@/lib/tmdb";
import NotFoundQuote from "@/components/NotFoundQuote";
import NotFoundSearch from "@/components/NotFoundSearch";

// Horizontal film strip with sprocket holes, rendered as inline SVG so it
// stays crisp at any width and doesn't depend on external assets.
function FilmStrip({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className="relative w-full h-16 sm:h-20 bg-[#0f0f12] overflow-hidden border-y border-black/60"
      style={{ marginTop: position === "bottom" ? 0 : undefined, marginBottom: position === "top" ? 0 : undefined }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 480 80"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`sprockets-${position}`} x="0" y="0" width="48" height="80" patternUnits="userSpaceOnUse">
            <rect x="12" y="20" width="24" height="40" rx="4" fill="#0b0b0f" />
          </pattern>
        </defs>
        <rect width="480" height="80" fill={`url(#sprockets-${position})`} />
      </svg>
    </div>
  );
}

async function getTrending(): Promise<Array<{ tmdbId: number; title: string; posterPath: string | null }>> {
  // TMDB's /trending/movie/week — the same source the home page uses.
  // Falls back to an empty list if TMDB is unreachable so the 404 still renders.
  try {
    const res = await getTrendingMovies("week");
    return res.results
      .filter((m) => m.poster_path)
      .slice(0, 4)
      .map((m) => ({ tmdbId: m.id, title: m.title, posterPath: m.poster_path ?? null }));
  } catch {
    return [];
  }
}

export default async function NotFound() {
  const trending = await getTrending();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <FilmStrip position="top" />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        {/* Giant 404 — unmistakable "this is an error page" signal */}
        <div className="text-center mb-4">
          <p className="text-7xl sm:text-8xl lg:text-9xl font-black tracking-tighter text-[var(--ratist-red)] leading-none">
            404
          </p>
        </div>

        {/* Scene slate subtitle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <Film className="w-5 h-5 text-[var(--ratist-red)]" />
          <span className="text-sm sm:text-base font-bold uppercase tracking-[0.3em] text-white">
            Scene Not Found
          </span>
          <Film className="w-5 h-5 text-[var(--ratist-red)]" />
        </div>

        {/* Rotating quote */}
        <div className="mb-10">
          <NotFoundQuote />
        </div>

        {/* Helper text */}
        <p className="text-center text-base sm:text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
          We searched the archive and couldn&apos;t find the page you&apos;re looking for. It may have been moved, renamed, or never existed in the first place.
        </p>

        {/* Search */}
        <div className="mb-10">
          <NotFoundSearch />
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-full hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Home className="w-4 h-4" /> Home
          </Link>
          <Link
            href="/movies"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-white text-sm font-semibold rounded-full hover:border-[var(--ratist-red)] transition-colors"
          >
            <Film className="w-4 h-4" /> Browse Movies & TV
          </Link>
          <Link
            href="/for-you"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-white text-sm font-semibold rounded-full hover:border-[var(--ratist-red)] transition-colors"
          >
            <Compass className="w-4 h-4" /> For You
          </Link>
          <Link
            href="/community"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-white text-sm font-semibold rounded-full hover:border-[var(--ratist-red)] transition-colors"
          >
            <TrendingUp className="w-4 h-4" /> Community
          </Link>
        </div>

        {/* Trending posters */}
        {trending.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--foreground-muted)] text-center mb-6">
              While you&apos;re here — what&apos;s trending
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {trending.map((m) => (
                <Link
                  key={m.tmdbId}
                  href={`/movies/${m.tmdbId}`}
                  className="group relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors"
                >
                  {m.posterPath ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w342${m.posterPath}`}
                      alt={`${m.title} poster`}
                      fill
                      sizes="(max-width: 640px) 50vw, 200px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)]">
                      <Film className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black via-black/70 to-transparent">
                    <p className="text-xs text-white font-medium line-clamp-2">{m.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Dead-link reporter */}
        <p className="text-center text-xs text-[var(--foreground-muted)] mt-16">
          Followed a broken link?{" "}
          <Link href="/feedback" className="underline hover:text-white transition-colors">
            Let us know
          </Link>{" "}
          so we can patch it up.
        </p>
      </main>

      <FilmStrip position="bottom" />
    </div>
  );
}
