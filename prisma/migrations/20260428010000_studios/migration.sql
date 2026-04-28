-- Studios + Movie↔Studio junction. Keyed by TMDB production_company
-- id (stable, deduped) rather than by name (TMDB has duplicate
-- names across regions for some studios). Drives /box-office/studios
-- and the per-studio drill-down.
CREATE TABLE "studios" (
  "id"             INTEGER PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "logo_path"      TEXT,
  "origin_country" TEXT
);

CREATE TABLE "movie_studios" (
  "movie_id"  TEXT NOT NULL REFERENCES "movies"("id") ON DELETE CASCADE,
  "studio_id" INTEGER NOT NULL REFERENCES "studios"("id") ON DELETE CASCADE,
  PRIMARY KEY ("movie_id", "studio_id")
);

-- The junction supports two access patterns:
-- 1) all studios of a given movie  →  PRIMARY KEY (movie_id, studio_id) covers it
-- 2) all movies of a given studio  →  needs a dedicated index
CREATE INDEX "movie_studios_studio_id_idx" ON "movie_studios" ("studio_id");
