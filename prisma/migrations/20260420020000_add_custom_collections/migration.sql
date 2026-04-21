-- CreateTable: custom_collections
CREATE TABLE "custom_collections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'movie',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "custom_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_collections_user_id_created_at_idx" ON "custom_collections"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "custom_collections" ADD CONSTRAINT "custom_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: custom_collection_items
CREATE TABLE "custom_collection_items" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster_path" TEXT,
    "release_date" TEXT,
    "vote_average" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "custom_collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_collection_items_collection_id_media_type_tmdb_id_key" ON "custom_collection_items"("collection_id", "media_type", "tmdb_id");
CREATE INDEX "custom_collection_items_collection_id_sort_order_idx" ON "custom_collection_items"("collection_id", "sort_order");

-- AddForeignKey
ALTER TABLE "custom_collection_items" ADD CONSTRAINT "custom_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "custom_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
