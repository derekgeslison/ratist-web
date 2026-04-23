-- User requests for admin-approved companion generation. Gets created when
-- a user hits /companion for a title that doesn't exist yet AND they're out
-- of self-service credits.

CREATE TABLE "companion_generation_requests" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "season" INTEGER,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "deny_reason" TEXT,
    "companion_id" TEXT,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_generation_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "companion_generation_requests_status_idx" ON "companion_generation_requests"("status");
CREATE INDEX "companion_generation_requests_tmdb_id_media_type_season_idx" ON "companion_generation_requests"("tmdb_id", "media_type", "season");
CREATE INDEX "companion_generation_requests_requester_id_idx" ON "companion_generation_requests"("requester_id");
