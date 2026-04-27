-- One-way block table. Either party blocking the other hides them
-- from each other's feeds, follower/following lists, search results,
-- and follow attempts. Two indexes — one for "did A block B?"
-- lookups (the unique constraint covers it) and one for the reverse
-- "who has blocked B?" lookup used when filtering content.
CREATE TABLE "user_blocks" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "blocker_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks" ("blocker_id", "blocked_id");
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks" ("blocked_id");
