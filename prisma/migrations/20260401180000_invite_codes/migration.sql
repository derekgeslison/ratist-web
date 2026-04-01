-- Add invite_code to users (nullable first for backfill)
ALTER TABLE "users" ADD COLUMN "invite_code" TEXT;

-- Generate invite codes for existing users (R- prefix + 7 random alphanumeric chars)
UPDATE "users" SET "invite_code" = 'R-' || substr(md5(random()::text || id), 1, 7) WHERE "invite_code" IS NULL;

-- Ensure uniqueness — fix any collisions
DO $$
DECLARE
  dup_record RECORD;
BEGIN
  FOR dup_record IN
    SELECT id FROM "users" WHERE "invite_code" IN (
      SELECT "invite_code" FROM "users" GROUP BY "invite_code" HAVING COUNT(*) > 1
    )
  LOOP
    UPDATE "users" SET "invite_code" = 'R-' || substr(md5(random()::text || dup_record.id || now()::text), 1, 7)
    WHERE id = dup_record.id;
  END LOOP;
END $$;

-- Now make it NOT NULL and UNIQUE
ALTER TABLE "users" ALTER COLUMN "invite_code" SET NOT NULL;
CREATE UNIQUE INDEX "users_invite_code_key" ON "users"("invite_code");

-- Add status to watchlist_collaborators
ALTER TABLE "watchlist_collaborators" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'accepted';
-- Existing collaborators are already accepted
