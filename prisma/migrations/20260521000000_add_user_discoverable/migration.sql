-- Add User.discoverable opt-out for /community user discovery surfaces.
-- Defaults to true so existing public users stay visible after deploy.
-- isPrivate=true already excludes a user from discovery regardless of
-- this column; this is the lighter-weight "visible profile, hidden
-- from the picker" lever.

ALTER TABLE "users"
ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT true;
