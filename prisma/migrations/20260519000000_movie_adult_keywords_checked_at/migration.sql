-- Tracks when a movie row was last evaluated against the adult-content
-- keyword blocklist. NULL means we've never checked. The popular-rail
-- safeguard uses this to avoid re-fetching keywords from TMDB on every
-- render; rows with a verdict (whether the verdict was "adult" or
-- "clean") are skipped on subsequent passes.
ALTER TABLE "movies" ADD COLUMN "adult_keywords_checked_at" TIMESTAMP(3);
