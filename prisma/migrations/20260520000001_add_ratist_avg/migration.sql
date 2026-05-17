-- Ratist's own community-average columns on Movie + TVShow. Maintained
-- by the rate routes. Fallback for the community badge when TMDB's
-- voteAverage is null/0. Backfill with scripts/backfill-ratist-avg.ts
-- after this migration applies.
ALTER TABLE "movies"   ADD COLUMN "ratist_avg" DOUBLE PRECISION;
ALTER TABLE "movies"   ADD COLUMN "ratist_count" INTEGER;
ALTER TABLE "tv_shows" ADD COLUMN "ratist_avg" DOUBLE PRECISION;
ALTER TABLE "tv_shows" ADD COLUMN "ratist_count" INTEGER;
