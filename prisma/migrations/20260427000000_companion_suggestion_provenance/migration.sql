-- Adds provenance fields to CompanionSuggestion so community-approved
-- changes can be (a) badged on the viewer as "this was a community
-- change" and (b) reverted by an admin if a troll brigade rams through
-- a bad suggestion. Both fields are nullable and back-populate as new
-- suggestions resolve.

ALTER TABLE "companion_suggestions" ADD COLUMN "applied_item_id" TEXT;
ALTER TABLE "companion_suggestions" ADD COLUMN "original_snapshot" JSONB;
