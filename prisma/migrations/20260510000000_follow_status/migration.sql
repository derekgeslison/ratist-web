-- Adds the follow request/accept workflow. Existing rows default to
-- "accepted" so already-live follows keep working. New rows started
-- when the followee has isPrivate=true will start as "pending" until
-- the followee approves them.
ALTER TABLE "user_follows"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'accepted';

-- Index supports the common query: count or list a user's followers
-- filtered by accepted status (used by counts, feeds, follower lists).
CREATE INDEX "user_follows_following_id_status_idx" ON "user_follows" ("following_id", "status");
