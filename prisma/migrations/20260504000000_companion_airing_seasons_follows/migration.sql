-- Per-season airing tracker for TV companions whose latest episode air date
-- + 2 days is still in the future. One row per (companion, season) created
-- when generation is first triggered for an actively-airing season. Powers
-- the cron sweep that auto-generates each new episode's companion entries
-- as episodes pass the 2-day buffer.
CREATE TABLE "companion_airing_seasons" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "episodes_generated" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'airing',
    "last_sweep_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companion_airing_seasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companion_airing_seasons_companion_id_season_number_key"
  ON "companion_airing_seasons"("companion_id", "season_number");

CREATE INDEX "companion_airing_seasons_status_idx"
  ON "companion_airing_seasons"("status");

ALTER TABLE "companion_airing_seasons" ADD CONSTRAINT
  "companion_airing_seasons_companion_id_fkey"
  FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- User subscriptions to a companion. Surfaces a Follow button while any of
-- the companion's seasons are airing; followers get a notification when
-- each new episode's content is generated. Per-companion (not per-season)
-- so a user's follow carries through to subsequent airing seasons.
CREATE TABLE "companion_follows" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companion_follows_companion_id_user_id_key"
  ON "companion_follows"("companion_id", "user_id");

CREATE INDEX "companion_follows_companion_id_idx"
  ON "companion_follows"("companion_id");

CREATE INDEX "companion_follows_user_id_idx"
  ON "companion_follows"("user_id");

ALTER TABLE "companion_follows" ADD CONSTRAINT
  "companion_follows_companion_id_fkey"
  FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "companion_follows" ADD CONSTRAINT
  "companion_follows_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
