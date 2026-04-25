-- Per-season rating scope. seasonNumber = 0 for movies (no seasons),
-- 1+ for TV seasons. Replaces the prior unique on (companion, user)
-- with a three-column unique that lets a viewer leave one rating per
-- season. Existing rows fall into the season=0 bucket — fine since
-- this feature only just shipped and no live ratings are season-
-- aware yet.

ALTER TABLE "watch_companion_ratings"
  ADD COLUMN "season_number" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "watch_companion_ratings_companion_id_user_id_key";

CREATE UNIQUE INDEX "watch_companion_ratings_companion_id_user_id_season_number_key"
  ON "watch_companion_ratings"("companion_id", "user_id", "season_number");

DROP INDEX "watch_companion_ratings_companion_id_vote_idx";

CREATE INDEX "watch_companion_ratings_companion_id_season_number_vote_idx"
  ON "watch_companion_ratings"("companion_id", "season_number", "vote");
