-- Per-user flag that disables Watch Companion suggestion submission for
-- troll/low-signal submitters. Enforced in the suggestion POST route.

ALTER TABLE "users" ADD COLUMN "companion_suggestions_blocked" BOOLEAN NOT NULL DEFAULT FALSE;
