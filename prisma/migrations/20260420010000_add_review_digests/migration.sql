-- CreateTable: review_digests
CREATE TABLE "review_digests" (
    "id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "review_count" INTEGER NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_digests_media_type_tmdb_id_key" ON "review_digests"("media_type", "tmdb_id");
