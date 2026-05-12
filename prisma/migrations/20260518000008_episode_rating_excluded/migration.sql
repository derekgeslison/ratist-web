-- Mirror the fraud-detection columns from movie_ratings /
-- tv_show_ratings onto episode_ratings so admins can exclude
-- review-bombed episode ratings from community averages without
-- deleting the user's row.
ALTER TABLE "episode_ratings"
  ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "excluded_at" TIMESTAMP(3),
  ADD COLUMN "excluded_reason" TEXT;
