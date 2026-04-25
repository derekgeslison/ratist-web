-- Per-user "was this companion helpful?" ratings. One vote per user
-- per companion (unique on companion_id + user_id). vote: 1 (thumbs
-- up) or -1 (thumbs down). Counts and comments are admin-only; the
-- public front-end never displays them.

CREATE TABLE "watch_companion_ratings" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "user_id" TEXT,
    "vote" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_companion_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watch_companion_ratings_companion_id_user_id_key"
  ON "watch_companion_ratings"("companion_id", "user_id");

CREATE INDEX "watch_companion_ratings_companion_id_vote_idx"
  ON "watch_companion_ratings"("companion_id", "vote");

ALTER TABLE "watch_companion_ratings" ADD CONSTRAINT
  "watch_companion_ratings_companion_id_fkey"
  FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_companion_ratings" ADD CONSTRAINT
  "watch_companion_ratings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
