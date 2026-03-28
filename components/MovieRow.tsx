import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { posterUrl, type TMDBMovie } from "@/lib/tmdb";

interface Props {
  title: string;
  movies: TMDBMovie[];
  viewAllHref?: string;
}

export default function MovieRow({ title, movies, viewAllHref }: Props) {
  if (!movies.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
          {movies.map((movie) => (
            <Link
              key={movie.id}
              href={`/movies/${movie.id}`}
              className="group flex flex-col w-[140px] shrink-0"
            >
              <div className="relative aspect-[2/3] w-[140px] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-2">
                <Image
                  src={posterUrl(movie.poster_path)}
                  alt={movie.title}
                  fill
                  sizes="140px"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <p className="text-xs font-medium text-white line-clamp-1 leading-tight">
                {movie.title}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {movie.release_date?.slice(0, 4) ?? "—"}
              </p>
              {movie.vote_average > 0 && (
                <p className="text-xs text-yellow-400 font-semibold mt-0.5">
                  ★ {movie.vote_average.toFixed(1)}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
