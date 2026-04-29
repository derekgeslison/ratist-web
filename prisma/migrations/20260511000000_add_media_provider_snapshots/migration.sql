-- CreateTable
CREATE TABLE "media_provider_snapshots" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "provider_ids" INTEGER[],
    "snapshot_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_provider_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_provider_snapshots_tmdb_id_media_type_region_snapshot_key" ON "media_provider_snapshots"("tmdb_id", "media_type", "region", "snapshot_date");

-- CreateIndex
CREATE INDEX "media_provider_snapshots_snapshot_date_idx" ON "media_provider_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "media_provider_snapshots_tmdb_id_media_type_region_idx" ON "media_provider_snapshots"("tmdb_id", "media_type", "region");
