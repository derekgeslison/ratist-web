-- "Notify me when this is streaming" subscriptions. A daily cron polls
-- TMDB watch-providers per row; when a flatrate entry first appears,
-- the row's notifiedAt is set and a notification fires to the user.
CREATE TABLE "streaming_watches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "notified_providers" TEXT,

    CONSTRAINT "streaming_watches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "streaming_watches_user_id_tmdb_id_media_type_key"
  ON "streaming_watches"("user_id", "tmdb_id", "media_type");

-- Cron filter: scan rows that haven't been notified yet.
CREATE INDEX "streaming_watches_notified_at_idx"
  ON "streaming_watches"("notified_at");

-- Dedupe in cron: many users may watch the same title — fetch providers
-- once per (tmdbId, mediaType) and apply to every matching row.
CREATE INDEX "streaming_watches_tmdb_id_media_type_idx"
  ON "streaming_watches"("tmdb_id", "media_type");

ALTER TABLE "streaming_watches" ADD CONSTRAINT
  "streaming_watches_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
