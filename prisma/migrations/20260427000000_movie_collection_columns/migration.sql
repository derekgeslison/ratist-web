-- Adds TMDB collection (franchise) metadata to the movies table for
-- the /box-office/franchises aggregation page. Stored inline rather
-- than in a separate Collection table — we only need id + name for
-- grouping and label rendering. The index supports fast GROUP BY for
-- franchise-total queries.
ALTER TABLE "movies" ADD COLUMN "tmdb_collection_id"   INTEGER;
ALTER TABLE "movies" ADD COLUMN "tmdb_collection_name" TEXT;

CREATE INDEX "movies_tmdb_collection_id_idx" ON "movies" ("tmdb_collection_id");
