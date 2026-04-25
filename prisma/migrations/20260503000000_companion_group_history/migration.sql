-- Group/faction history for characters who switch sides or have hidden
-- allegiances mid-story (Khan reveal pattern, Severus Snape, FN-2187 → Finn).
-- Mirrors the existing nameAliases pattern: an array of
-- { group, visibleAfter } entries layered over the primary `group` column.
-- The viewer picks the latest unlocked entry whose visibleAfter is <= the
-- current slider position, falling back to `group` when none have unlocked.
ALTER TABLE "companion_characters" ADD COLUMN "group_history" JSONB;
