-- Optional expiry on the companion-suggestions block. Null = permanent.
ALTER TABLE "users"
  ADD COLUMN "companion_suggestions_blocked_until" TIMESTAMP(3);
