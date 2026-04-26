-- Adds the pinCheckedToBottom watchlist setting. Off by default so
-- existing users continue to see their lists in the active sort
-- order without the secondary "checked-last" pass.
ALTER TABLE "users"
  ADD COLUMN "pin_checked_to_bottom" BOOLEAN NOT NULL DEFAULT false;
