-- Add composite indexes on movie_ratings and tv_show_ratings.
--
-- These cover the hottest queries on the site: community-average
-- aggregation per movie/show (runs on every detail page load) and
-- "recent ratings by user X" (For-You feed, profile diary).
--
-- At current scale (~50K rating rows total) the planner already
-- runs these fast via seq scan; the indexes are preventative for
-- when the table grows past ~5M rows. Build time on the current
-- size: well under one second per index, so we keep plain
-- CREATE INDEX rather than CONCURRENTLY (which can't run inside
-- the transaction Prisma wraps each migration in).

-- movie_ratings: support community-average aggregation
CREATE INDEX IF NOT EXISTS "movie_ratings_movie_id_ratist_rating_idx"
  ON "movie_ratings" ("movie_id", "ratist_rating");

CREATE INDEX IF NOT EXISTS "movie_ratings_movie_id_plot_idx"
  ON "movie_ratings" ("movie_id", "plot");

-- movie_ratings: support "recent ratings by user" feeds
CREATE INDEX IF NOT EXISTS "movie_ratings_user_id_created_at_idx"
  ON "movie_ratings" ("user_id", "created_at");

-- tv_show_ratings: same patterns, plus rating_scope since show
-- pages query series-level OR season-level (not both at once)
CREATE INDEX IF NOT EXISTS "tv_show_ratings_tv_show_id_rating_scope_ratist_rating_idx"
  ON "tv_show_ratings" ("tv_show_id", "rating_scope", "ratist_rating");

CREATE INDEX IF NOT EXISTS "tv_show_ratings_tv_show_id_rating_scope_plot_idx"
  ON "tv_show_ratings" ("tv_show_id", "rating_scope", "plot");

CREATE INDEX IF NOT EXISTS "tv_show_ratings_user_id_created_at_idx"
  ON "tv_show_ratings" ("user_id", "created_at");
