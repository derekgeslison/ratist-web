-- Snapshot of name/avatarUrl/bio captured at soft-delete time so the
-- restore flow can put identity back without leaving display surfaces
-- showing the deleted user's real name for 30 days.
ALTER TABLE "users" ADD COLUMN "deleted_snapshot" JSONB;
