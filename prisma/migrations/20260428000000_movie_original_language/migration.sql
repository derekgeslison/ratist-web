-- Adds TMDB original_language to the movies table for the language
-- filter on /box-office/all. Stored as ISO 639-1 (e.g. "en", "ko",
-- "fr"). The index supports the filter's WHERE clause.
ALTER TABLE "movies" ADD COLUMN "original_language" TEXT;

CREATE INDEX "movies_original_language_idx" ON "movies" ("original_language");
