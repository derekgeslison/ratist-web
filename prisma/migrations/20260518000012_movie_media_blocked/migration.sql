-- Suppress the Media tab images on this movie. NC-17 is auto-
-- suppressed at the page level even when this column is false
-- (those are almost always explicit); admins can additionally
-- flip this for NR / unrated movies whose Media tab is reported
-- by a viewer as containing nudity.
ALTER TABLE "movies" ADD COLUMN "media_blocked" BOOLEAN NOT NULL DEFAULT false;
