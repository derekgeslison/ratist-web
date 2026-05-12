-- Mirrors TMDB's `adult` boolean on every movie row. Drives the
-- hide-entirely policy when combined with mpaaRating === "NC-17"
-- (pornographic NC-17 entries are filtered from all browse / search
-- / discovery / detail surfaces; NR / null-rated adult titles keep
-- the existing poster-block masking instead).
ALTER TABLE "movies" ADD COLUMN "is_adult" BOOLEAN NOT NULL DEFAULT false;
