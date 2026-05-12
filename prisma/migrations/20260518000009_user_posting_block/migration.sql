-- Soft posting block on user. Separate from the existing
-- banned_at / banned_until ban columns: a posting-blocked user can
-- still browse and rate movies/shows/episodes, but can't comment,
-- create forum threads/replies, or post to community surfaces.
ALTER TABLE "users"
  ADD COLUMN "posting_blocked_at" TIMESTAMP(3),
  ADD COLUMN "posting_blocked_until" TIMESTAMP(3),
  ADD COLUMN "posting_block_reason" TEXT;
