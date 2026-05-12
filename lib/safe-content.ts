import { prisma } from "@/lib/prisma";

/**
 * Browse / discovery safety helpers. Two concerns wired up here:
 *
 * 1. NC-17 movies must never appear on the home page or in other
 *    public discovery rails. TMDB list endpoints don't return MPAA
 *    rating inline, so we cache certifications on Movie.mpaaRating
 *    (via upsertMovie on detail views) and post-filter using that.
 *    Items we haven't cached yet pass through — the worst case is
 *    one impression for a film no one has ever interacted with on
 *    the site, after which it gets cached and filtered.
 *
 * 2. Some posters (NC-17 or otherwise) contain explicit nudity. We
 *    let admins block individual posters via Movie.posterBlocked /
 *    TVShow.posterBlocked; this helper nulls out `poster_path` on
 *    matched items so the existing "no poster" placeholder kicks
 *    in across every render path that consumes a TMDB-shaped list.
 */

type MovieLike = { id: number; poster_path: string | null };
type ShowLike = { id: number; poster_path: string | null };

/**
 * Apply NC-17 filter + poster-block masking to a list of TMDB-shaped
 * movies. Pass `filterNC17: true` for public discovery rails; pass
 * `stripBlockedPosters: true` for any surface that renders posters.
 * Both are safe to call together.
 */
export async function safeguardTMDBMovies<T extends MovieLike>(
  items: T[],
  opts: { filterNC17?: boolean; stripBlockedPosters?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items;
  const tmdbIds = items.map((i) => i.id);
  const rows = await prisma.movie.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { tmdbId: true, mpaaRating: true, posterBlocked: true },
  });
  const map = new Map(rows.map((r) => [r.tmdbId, r]));

  let result: T[] = items;
  if (opts.filterNC17) {
    result = result.filter((i) => map.get(i.id)?.mpaaRating !== "NC-17");
  }
  if (opts.stripBlockedPosters) {
    result = result.map((i) => {
      const row = map.get(i.id);
      if (row?.posterBlocked) return { ...i, poster_path: null };
      return i;
    });
  }
  return result;
}

/** TV analogue. Filters on contentRating === "TV-MA" if requested. */
export async function safeguardTMDBShows<T extends ShowLike>(
  items: T[],
  opts: { stripBlockedPosters?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items;
  const tmdbIds = items.map((i) => i.id);
  const rows = await prisma.tVShow.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { tmdbId: true, posterBlocked: true },
  });
  const map = new Map(rows.map((r) => [r.tmdbId, r]));

  let result: T[] = items;
  if (opts.stripBlockedPosters) {
    result = result.map((i) => {
      const row = map.get(i.id);
      if (row?.posterBlocked) return { ...i, poster_path: null };
      return i;
    });
  }
  return result;
}
