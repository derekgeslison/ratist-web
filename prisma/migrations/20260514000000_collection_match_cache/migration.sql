-- Per-user match-score cache for community collection cards. Score is
-- 0-100 (or NULL when the user has no profile yet, or no community
-- ratings exist for the items in the collection). Caching NULL is
-- intentional — it prevents re-running the prediction on every feed
-- view. The row is invalidated by the application layer when:
--   1. The collection's items change (PATCH or unpublish wipes by collection_id)
--   2. The user's profile is rebuilt (rebuildUserProfile wipes by user_id)
CREATE TABLE "collection_match_cache" (
  "user_id"       TEXT NOT NULL REFERENCES "users"("id")               ON DELETE CASCADE,
  "collection_id" TEXT NOT NULL REFERENCES "custom_collections"("id")  ON DELETE CASCADE,
  "score"         INTEGER,
  "computed_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "collection_id")
);

-- Wipe-by-collection (item edits, visibility flips).
CREATE INDEX "collection_match_cache_collection_id_idx"
  ON "collection_match_cache" ("collection_id");

-- Match tab orderBy (user_id, score desc). Postgres can walk a single
-- B-tree index in either direction so an explicit DESC isn't needed
-- for this column ordering.
CREATE INDEX "collection_match_cache_user_id_score_idx"
  ON "collection_match_cache" ("user_id", "score");
