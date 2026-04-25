-- Mutex table to prevent concurrent Watch Companion generations on the
-- same (tmdbId, mediaType, season). Acquired at the start of
-- generateCompanionStream, released when the stream completes or errors.
-- Stale locks (>10 min, from a crashed gen) are auto-overwritten by the
-- next acquirer.
CREATE TABLE "companion_generation_locks" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquired_by" TEXT,

    CONSTRAINT "companion_generation_locks_pkey" PRIMARY KEY ("id")
);

-- Unique on the composite key. season=0 is the sentinel for movies — a
-- nullable column would let multiple NULL rows through under Postgres
-- semantics, defeating the lock.
CREATE UNIQUE INDEX "companion_generation_locks_tmdb_id_media_type_season_key"
  ON "companion_generation_locks"("tmdb_id", "media_type", "season");
