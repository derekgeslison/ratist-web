-- Per-companion "what happened previously" recap blob. Movies use the
-- shape:
--   { current: { title, year, text }, prior: [{tmdbId, title, year, text}, ...] }
-- TV uses per-season keys:
--   { "1": "S1 recap", "2": "S2 recap", ... }
-- The viewer's Recap tab parses based on the companion's mediaType.

ALTER TABLE "watch_companions"
  ADD COLUMN "recaps" JSONB;
