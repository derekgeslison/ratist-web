-- Admin-set poster block for movies + TV shows. Some NC-17 / adult-
-- leaning titles ship posters containing explicit nudity that we
-- don't want surfacing on browse / discovery rails (home page,
-- celebrity filmographies, search results, etc.). When true, render
-- layers replace the poster with a neutral placeholder; the title
-- itself remains accessible.
ALTER TABLE "movies" ADD COLUMN "poster_blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tv_shows" ADD COLUMN "poster_blocked" BOOLEAN NOT NULL DEFAULT false;
