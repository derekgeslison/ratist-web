-- Track who added each entry to a watchlist so collaborative lists
-- can show "added by X" attribution. Nullable so existing rows
-- (pre-migration adds) read as "added by — unknown" rather than
-- breaking. ON DELETE SET NULL keeps the entry on the list even if
-- the adding user later deletes their account.

ALTER TABLE "watchlist_movies"
ADD COLUMN "added_by_id" TEXT;

ALTER TABLE "watchlist_movies"
ADD CONSTRAINT "watchlist_movies_added_by_id_fkey"
FOREIGN KEY ("added_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watchlist_shows"
ADD COLUMN "added_by_id" TEXT;

ALTER TABLE "watchlist_shows"
ADD CONSTRAINT "watchlist_shows_added_by_id_fkey"
FOREIGN KEY ("added_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Index the new FK column so per-user joins ("things I added to this
-- list") stay fast as collaborative lists grow.
CREATE INDEX "watchlist_movies_added_by_id_idx" ON "watchlist_movies"("added_by_id");
CREATE INDEX "watchlist_shows_added_by_id_idx" ON "watchlist_shows"("added_by_id");
